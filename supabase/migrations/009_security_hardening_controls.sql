create extension if not exists pgcrypto;

create or replace function has_mfa_context()
returns boolean
language plpgsql
stable
as $$
declare
  v_claims jsonb := coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
  v_aal text := coalesce(v_claims ->> 'aal', '');
  v_amr jsonb := coalesce(v_claims -> 'amr', '[]'::jsonb);
begin
  if v_aal in ('aal2', 'aal3') then
    return true;
  end if;

  if jsonb_typeof(v_amr) = 'array' and (
    v_amr @> '["totp"]'::jsonb
    or v_amr @> '["mfa"]'::jsonb
    or v_amr @> '["webauthn"]'::jsonb
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function require_mfa_for_sensitive_operation(p_operation text)
returns void
language plpgsql
security definer
as $$
begin
  if not has_mfa_context() then
    raise exception 'MFA_REQUIRED for sensitive operation: %', p_operation
      using errcode = '42501';
  end if;
end;
$$;

create table if not exists period_close_audit_trail (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  close_entry_id uuid references journal_entries(id) on delete set null,
  period_end date,
  net_income_cents bigint,
  actor_user_id uuid,
  action text not null default 'period_close' check (action = 'period_close'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists account_link_audit_trail (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  plaid_item_id text,
  account_id uuid references accounts(id) on delete set null,
  actor_user_id uuid,
  action text not null check (action in ('link', 'disconnect')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists threshold_change_audit_trail (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_low_liquid_position_threshold_cents bigint,
  new_low_liquid_position_threshold_cents bigint,
  old_accrued_liability_threshold_cents bigint,
  new_accrued_liability_threshold_cents bigint,
  old_large_transaction_threshold_cents bigint,
  new_large_transaction_threshold_cents bigint,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function trg_enforce_mfa_on_household_role_change()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role then
    perform require_mfa_for_sensitive_operation('household_member_role_change');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_mfa_on_household_role_change on household_members;
create trigger trg_enforce_mfa_on_household_role_change
  before update of role on household_members
  for each row
  execute function trg_enforce_mfa_on_household_role_change();


create or replace function trg_enforce_mfa_on_period_close()
returns trigger
language plpgsql
as $$
begin
  if new.entry_type = 'close' and new.source = 'period_close' then
    perform require_mfa_for_sensitive_operation('period_close');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_mfa_on_period_close on journal_entries;
create trigger trg_enforce_mfa_on_period_close
  before insert on journal_entries
  for each row
  execute function trg_enforce_mfa_on_period_close();

create or replace function trg_audit_period_close()
returns trigger
language plpgsql
as $$
begin
  if new.entry_type = 'close' and new.source = 'period_close' and new.is_posted = true then
    insert into period_close_audit_trail (
      household_id,
      close_entry_id,
      period_end,
      net_income_cents,
      actor_user_id,
      metadata
    )
    values (
      new.household_id,
      new.id,
      new.effective_date,
      (
        select coalesce(sum(case when jl.side = 'credit' then jl.amount_cents else -jl.amount_cents end), 0)
        from journal_lines jl
        join accounts a on a.id = jl.account_id
        where jl.journal_entry_id = new.id
          and a.account_subtype = 'retained_equity'
      ),
      coalesce(new.created_by, auth.uid()),
      jsonb_build_object('description', new.description)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_period_close on journal_entries;
create trigger trg_audit_period_close
  after insert on journal_entries
  for each row
  execute function trg_audit_period_close();

create or replace function trg_audit_plaid_item_link_disconnect()
returns trigger
language plpgsql
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'link';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'disconnected' then
    v_action := 'disconnect';
  else
    return new;
  end if;

  insert into account_link_audit_trail (
    household_id,
    plaid_item_id,
    actor_user_id,
    action,
    metadata
  )
  values (
    new.household_id,
    new.plaid_item_id,
    auth.uid(),
    v_action,
    jsonb_build_object(
      'institution_name', new.institution_name,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_plaid_item_link_disconnect on plaid_items;
create trigger trg_audit_plaid_item_link_disconnect
  after insert or update of status on plaid_items
  for each row
  execute function trg_audit_plaid_item_link_disconnect();

create or replace function trg_audit_threshold_changes()
returns trigger
language plpgsql
as $$
begin
  if old.low_liquid_position_threshold_cents is distinct from new.low_liquid_position_threshold_cents
    or old.accrued_liability_threshold_cents is distinct from new.accrued_liability_threshold_cents
    or old.large_transaction_threshold_cents is distinct from new.large_transaction_threshold_cents then
    insert into threshold_change_audit_trail (
      user_id,
      old_low_liquid_position_threshold_cents,
      new_low_liquid_position_threshold_cents,
      old_accrued_liability_threshold_cents,
      new_accrued_liability_threshold_cents,
      old_large_transaction_threshold_cents,
      new_large_transaction_threshold_cents,
      actor_user_id,
      metadata
    )
    values (
      new.user_id,
      old.low_liquid_position_threshold_cents,
      new.low_liquid_position_threshold_cents,
      old.accrued_liability_threshold_cents,
      new.accrued_liability_threshold_cents,
      old.large_transaction_threshold_cents,
      new.large_transaction_threshold_cents,
      auth.uid(),
      jsonb_build_object('source', 'notification_preferences_update')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_threshold_changes on notification_preferences;
create trigger trg_audit_threshold_changes
  after update on notification_preferences
  for each row
  execute function trg_audit_threshold_changes();

alter table plaid_items
  add column if not exists plaid_access_token_encrypted bytea;

alter table accounts
  add column if not exists plaid_access_token_encrypted bytea;

create or replace function encrypt_plaid_access_token(p_token text)
returns bytea
language plpgsql
security definer
as $$
declare
  v_key text := current_setting('app.plaid_token_encryption_key', true);
begin
  if p_token is null then
    return null;
  end if;

  if v_key is null or length(v_key) < 16 then
    raise exception 'app.plaid_token_encryption_key must be configured for Plaid token encryption';
  end if;

  return pgp_sym_encrypt(p_token, v_key, 'cipher-algo=aes256, compress-algo=1');
end;
$$;

create or replace function decrypt_plaid_access_token(p_ciphertext bytea)
returns text
language plpgsql
security definer
as $$
declare
  v_key text := current_setting('app.plaid_token_encryption_key', true);
begin
  if p_ciphertext is null then
    return null;
  end if;

  if v_key is null or length(v_key) < 16 then
    raise exception 'app.plaid_token_encryption_key must be configured for Plaid token decryption';
  end if;

  return pgp_sym_decrypt(p_ciphertext, v_key);
end;
$$;

update plaid_items
set plaid_access_token_encrypted = encrypt_plaid_access_token(plaid_access_token),
    plaid_access_token = null
where plaid_access_token is not null
  and plaid_access_token_encrypted is null;

update accounts
set plaid_access_token_encrypted = encrypt_plaid_access_token(plaid_access_token),
    plaid_access_token = null
where plaid_access_token is not null
  and plaid_access_token_encrypted is null;

create or replace function trg_encrypt_plaid_tokens()
returns trigger
language plpgsql
as $$
begin
  if new.plaid_access_token is not null then
    new.plaid_access_token_encrypted := encrypt_plaid_access_token(new.plaid_access_token);
    new.plaid_access_token := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_encrypt_plaid_tokens_on_plaid_items on plaid_items;
create trigger trg_encrypt_plaid_tokens_on_plaid_items
  before insert or update of plaid_access_token on plaid_items
  for each row
  execute function trg_encrypt_plaid_tokens();

drop trigger if exists trg_encrypt_plaid_tokens_on_accounts on accounts;
create trigger trg_encrypt_plaid_tokens_on_accounts
  before insert or update of plaid_access_token on accounts
  for each row
  execute function trg_encrypt_plaid_tokens();

revoke select (plaid_access_token, plaid_access_token_encrypted) on plaid_items from anon, authenticated;
revoke select (plaid_access_token, plaid_access_token_encrypted) on accounts from anon, authenticated;

create or replace function get_plaid_item_access_token(p_plaid_item_id text)
returns text
language plpgsql
security definer
as $$
declare
  v_claims jsonb := coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
  v_role text := coalesce(v_claims ->> 'role', '');
  v_token_cipher bytea;
begin
  if v_role <> 'service_role' then
    raise exception 'Only service_role can access Plaid access tokens' using errcode = '42501';
  end if;

  select plaid_access_token_encrypted
    into v_token_cipher
  from plaid_items
  where plaid_item_id = p_plaid_item_id;

  if v_token_cipher is null then
    return null;
  end if;

  return decrypt_plaid_access_token(v_token_cipher);
end;
$$;
