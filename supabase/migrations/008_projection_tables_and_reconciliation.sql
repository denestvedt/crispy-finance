-- Projection tables for dashboard reads.
create table if not exists household_liquid_position_projection (
  household_id uuid primary key references households(id) on delete cascade,
  gross_cash_cents bigint not null default 0,
  accrued_liabilities_cents bigint not null default 0,
  outstanding_credit_balances_cents bigint not null default 0,
  provisioned_obligations_cents bigint not null default 0,
  true_liquid_position_cents bigint not null default 0,
  as_of date not null default current_date,
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists household_account_subtype_projection (
  household_id uuid not null references households(id) on delete cascade,
  account_type text not null,
  account_subtype text not null,
  liquidity_tier text,
  balance_cents bigint not null,
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, account_type, account_subtype, liquidity_tier)
);

create table if not exists household_unread_notifications_projection (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unread_count int not null default 0,
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists idx_projection_account_subtype_household
  on household_account_subtype_projection (household_id, account_type, account_subtype);

create index if not exists idx_projection_unread_household_user
  on household_unread_notifications_projection (household_id, user_id);

create or replace function ledger_balances_by_account(
  p_household_id uuid
)
returns table (account_id uuid, balance_cents bigint)
language sql
stable
as $$
  select
    a.id as account_id,
    coalesce(sum(
      case
        when a.account_type in ('asset', 'expense') and jl.side = 'debit' then jl.amount_cents
        when a.account_type in ('asset', 'expense') and jl.side = 'credit' then -jl.amount_cents
        when a.account_type in ('liability', 'equity', 'income') and jl.side = 'credit' then jl.amount_cents
        when a.account_type in ('liability', 'equity', 'income') and jl.side = 'debit' then -jl.amount_cents
        else 0
      end
    ), 0)::bigint as balance_cents
  from accounts a
  left join journal_lines jl on jl.account_id = a.id
  left join journal_entries je on je.id = jl.journal_entry_id
    and je.is_posted = true
    and je.household_id = p_household_id
  where a.household_id = p_household_id
  group by a.id;
$$;

create or replace function refresh_household_projections(
  p_household_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_gross_cash bigint := 0;
  v_accrued_liabilities bigint := 0;
  v_outstanding_credit bigint := 0;
  v_provisioned_obligations bigint := 0;
begin
  with balances as (
    select
      a.id,
      a.account_type,
      a.account_subtype,
      a.liquidity_tier,
      b.balance_cents
    from accounts a
    join ledger_balances_by_account(p_household_id) b on b.account_id = a.id
    where a.household_id = p_household_id
  )
  insert into household_account_subtype_projection (
    household_id,
    account_type,
    account_subtype,
    liquidity_tier,
    balance_cents,
    source_updated_at,
    updated_at
  )
  select
    p_household_id,
    account_type,
    account_subtype,
    liquidity_tier,
    sum(balance_cents)::bigint,
    v_now,
    v_now
  from balances
  group by account_type, account_subtype, liquidity_tier
  on conflict (household_id, account_type, account_subtype, liquidity_tier)
  do update
  set balance_cents = excluded.balance_cents,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at;

  delete from household_account_subtype_projection p
  where p.household_id = p_household_id
    and not exists (
      select 1
      from accounts a
      where a.household_id = p_household_id
        and a.account_type = p.account_type
        and a.account_subtype = p.account_subtype
        and a.liquidity_tier is not distinct from p.liquidity_tier
    );

  select
    coalesce(sum(balance_cents) filter (
      where account_type = 'asset' and liquidity_tier in ('cash_equivalent', 'near_liquid')
    ), 0),
    coalesce(sum(balance_cents) filter (
      where account_type = 'liability' and account_subtype = 'accrued_liability'
    ), 0),
    coalesce(sum(balance_cents) filter (
      where account_type = 'liability' and account_subtype = 'current_liability'
    ), 0)
  into v_gross_cash, v_accrued_liabilities, v_outstanding_credit
  from household_account_subtype_projection
  where household_id = p_household_id;

  select coalesce(sum(estimated_amount_cents), 0)::bigint
  into v_provisioned_obligations
  from obligations
  where household_id = p_household_id
    and is_active = true
    and next_due_date <= current_date;

  insert into household_liquid_position_projection (
    household_id,
    gross_cash_cents,
    accrued_liabilities_cents,
    outstanding_credit_balances_cents,
    provisioned_obligations_cents,
    true_liquid_position_cents,
    as_of,
    source_updated_at,
    updated_at
  )
  values (
    p_household_id,
    v_gross_cash,
    v_accrued_liabilities,
    v_outstanding_credit,
    v_provisioned_obligations,
    v_gross_cash - v_accrued_liabilities - v_outstanding_credit - v_provisioned_obligations,
    current_date,
    v_now,
    v_now
  )
  on conflict (household_id)
  do update
  set gross_cash_cents = excluded.gross_cash_cents,
      accrued_liabilities_cents = excluded.accrued_liabilities_cents,
      outstanding_credit_balances_cents = excluded.outstanding_credit_balances_cents,
      provisioned_obligations_cents = excluded.provisioned_obligations_cents,
      true_liquid_position_cents = excluded.true_liquid_position_cents,
      as_of = excluded.as_of,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at;

  insert into household_unread_notifications_projection (
    household_id,
    user_id,
    unread_count,
    source_updated_at,
    updated_at
  )
  select
    n.household_id,
    n.user_id,
    count(*) filter (where n.is_read = false)::int,
    v_now,
    v_now
  from notifications n
  where n.household_id = p_household_id
  group by n.household_id, n.user_id
  on conflict (household_id, user_id)
  do update
  set unread_count = excluded.unread_count,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at;

  delete from household_unread_notifications_projection p
  where p.household_id = p_household_id
    and not exists (
      select 1
      from notifications n
      where n.household_id = p.household_id
        and n.user_id = p.user_id
    );
end;
$$;

create or replace function rebuild_household_projections(
  p_household_id uuid default null
)
returns int
language plpgsql
security definer
as $$
declare
  v_household record;
  v_count int := 0;
begin
  for v_household in
    select id
    from households
    where p_household_id is null or id = p_household_id
    order by id
  loop
    perform refresh_household_projections(v_household.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function refresh_household_projections_for_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  perform refresh_household_projections(coalesce(new.household_id, old.household_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_notifications_projection_refresh on notifications;

create trigger trg_notifications_projection_refresh
  after insert or update or delete on notifications
  for each row execute function refresh_household_projections_for_notification();

create or replace function refresh_household_projections_for_accounting()
returns trigger
language plpgsql
security definer
as $$
declare
  v_household_id uuid;
begin
  v_household_id := coalesce(new.household_id, old.household_id);
  perform refresh_household_projections(v_household_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_accounts_projection_refresh on accounts;

create trigger trg_accounts_projection_refresh
  after insert or update or delete on accounts
  for each row execute function refresh_household_projections_for_accounting();

drop trigger if exists trg_obligations_projection_refresh on obligations;

create trigger trg_obligations_projection_refresh
  after insert or update or delete on obligations
  for each row execute function refresh_household_projections_for_accounting();

create table if not exists projection_reconciliation_runs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  reconciled_at timestamptz not null default now(),
  liquid_projection_matches boolean not null,
  account_projection_matches boolean not null,
  unread_projection_matches boolean not null,
  mismatch_details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projection_reconciliation_household_created
  on projection_reconciliation_runs (household_id, created_at desc);

create or replace function reconcile_household_projections(
  p_household_id uuid default null
)
returns int
language plpgsql
security definer
as $$
declare
  v_household record;
  v_count int := 0;
  v_liquid_match boolean;
  v_account_match boolean;
  v_unread_match boolean;
  v_details jsonb;
begin
  for v_household in
    select id
    from households
    where p_household_id is null or id = p_household_id
    order by id
  loop
    with ledger_liquid as (
      select * from (
        with balances as (
          select
            a.account_type,
            a.account_subtype,
            a.liquidity_tier,
            b.balance_cents
          from accounts a
          join ledger_balances_by_account(v_household.id) b on b.account_id = a.id
          where a.household_id = v_household.id
        )
        select
          coalesce(sum(balance_cents) filter (where account_type = 'asset' and liquidity_tier in ('cash_equivalent', 'near_liquid')), 0)::bigint as gross_cash_cents,
          coalesce(sum(balance_cents) filter (where account_type = 'liability' and account_subtype = 'accrued_liability'), 0)::bigint as accrued_liabilities_cents,
          coalesce(sum(balance_cents) filter (where account_type = 'liability' and account_subtype = 'current_liability'), 0)::bigint as outstanding_credit_balances_cents
        from balances
      ) m
    ),
    obligations_totals as (
      select coalesce(sum(estimated_amount_cents), 0)::bigint as provisioned_obligations_cents
      from obligations
      where household_id = v_household.id
        and is_active = true
        and next_due_date <= current_date
    ),
    expected_liquid as (
      select
        l.gross_cash_cents,
        l.accrued_liabilities_cents,
        l.outstanding_credit_balances_cents,
        o.provisioned_obligations_cents,
        (l.gross_cash_cents - l.accrued_liabilities_cents - l.outstanding_credit_balances_cents - o.provisioned_obligations_cents) as true_liquid_position_cents
      from ledger_liquid l
      cross join obligations_totals o
    )
    select
      exists (
        select 1
        from expected_liquid e
        join household_liquid_position_projection p on p.household_id = v_household.id
        where p.gross_cash_cents = e.gross_cash_cents
          and p.accrued_liabilities_cents = e.accrued_liabilities_cents
          and p.outstanding_credit_balances_cents = e.outstanding_credit_balances_cents
          and p.provisioned_obligations_cents = e.provisioned_obligations_cents
          and p.true_liquid_position_cents = e.true_liquid_position_cents
      ) as liquid_match,
      not exists (
        with expected as (
          select
            a.account_type,
            a.account_subtype,
            a.liquidity_tier,
            sum(b.balance_cents)::bigint as balance_cents
          from accounts a
          join ledger_balances_by_account(v_household.id) b on b.account_id = a.id
          where a.household_id = v_household.id
          group by a.account_type, a.account_subtype, a.liquidity_tier
        ),
        actual as (
          select account_type, account_subtype, liquidity_tier, balance_cents
          from household_account_subtype_projection
          where household_id = v_household.id
        )
        (
          select * from expected
          except all
          select * from actual
        )
        union all
        (
          select * from actual
          except all
          select * from expected
        )
      ) as account_match,
      not exists (
        with expected as (
          select user_id, count(*) filter (where is_read = false)::int as unread_count
          from notifications
          where household_id = v_household.id
          group by user_id
        ),
        actual as (
          select user_id, unread_count
          from household_unread_notifications_projection
          where household_id = v_household.id
        )
        (
          select * from expected
          except all
          select * from actual
        )
        union all
        (
          select * from actual
          except all
          select * from expected
        )
      ) as unread_match
    into v_liquid_match, v_account_match, v_unread_match;

    v_details := jsonb_build_object(
      'liquid_projection_matches', v_liquid_match,
      'account_projection_matches', v_account_match,
      'unread_projection_matches', v_unread_match
    );

    insert into projection_reconciliation_runs (
      household_id,
      liquid_projection_matches,
      account_projection_matches,
      unread_projection_matches,
      mismatch_details
    ) values (
      v_household.id,
      v_liquid_match,
      v_account_match,
      v_unread_match,
      case
        when v_liquid_match and v_account_match and v_unread_match then null
        else v_details
      end
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function get_household_liquid_position_projection(
  p_household_id uuid
)
returns table (
  gross_cash numeric,
  accrued_liabilities numeric,
  outstanding_credit_balances numeric,
  provisioned_obligations numeric,
  true_liquid_position numeric,
  as_of timestamptz
)
language sql
security definer
as $$
  select
    (gross_cash_cents::numeric / 100) as gross_cash,
    (accrued_liabilities_cents::numeric / 100) as accrued_liabilities,
    (outstanding_credit_balances_cents::numeric / 100) as outstanding_credit_balances,
    (provisioned_obligations_cents::numeric / 100) as provisioned_obligations,
    (true_liquid_position_cents::numeric / 100) as true_liquid_position,
    (as_of::timestamptz + time '00:00:00') as as_of
  from household_liquid_position_projection
  where household_id = p_household_id;
$$;

create or replace function post_journal_entry(
  p_household_id uuid,
  p_entry_date date,
  p_effective_date date,
  p_description text,
  p_entry_type text,
  p_source text,
  p_lines jsonb,
  p_created_by uuid default auth.uid(),
  p_idempotency_key text default null
)
returns table (journal_entry_id uuid, replayed boolean, is_posted boolean)
language plpgsql
security definer
as $$
declare
  v_entry_id uuid;
  v_debits bigint := 0;
  v_credits bigint := 0;
  v_line jsonb;
  v_response jsonb;
begin
  if p_idempotency_key is not null then
    select response_payload
      into v_response
    from api_idempotency_keys
    where household_id = p_household_id
      and contract_name = 'post_journal_entry'
      and idempotency_key = p_idempotency_key;

    if v_response is not null then
      return query
      select
        (v_response ->> 'journal_entry_id')::uuid,
        true,
        coalesce((v_response ->> 'is_posted')::boolean, true);
      return;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty JSON array';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if coalesce(v_line ->> 'side', '') = 'debit' then
      v_debits := v_debits + (v_line ->> 'amount_cents')::bigint;
    elsif coalesce(v_line ->> 'side', '') = 'credit' then
      v_credits := v_credits + (v_line ->> 'amount_cents')::bigint;
    else
      raise exception 'Invalid side in journal line: %', v_line ->> 'side';
    end if;
  end loop;

  if v_debits <> v_credits then
    raise exception 'Journal entry is unbalanced debits=% credits=%', v_debits, v_credits;
  end if;

  insert into journal_entries (
    household_id,
    entry_date,
    effective_date,
    description,
    entry_type,
    source,
    is_posted,
    created_by
  ) values (
    p_household_id,
    coalesce(p_entry_date, current_date),
    coalesce(p_effective_date, current_date),
    p_description,
    p_entry_type,
    p_source,
    true,
    p_created_by
  )
  returning id into v_entry_id;

  insert into journal_lines (journal_entry_id, account_id, amount, amount_cents, side, memo)
  select
    v_entry_id,
    (line ->> 'account_id')::uuid,
    ((line ->> 'amount_cents')::numeric / 100),
    (line ->> 'amount_cents')::bigint,
    line ->> 'side',
    nullif(line ->> 'memo', '')
  from jsonb_array_elements(p_lines) as line;

  perform refresh_household_projections(p_household_id);

  if p_idempotency_key is not null then
    insert into api_idempotency_keys (
      household_id,
      contract_name,
      idempotency_key,
      response_payload
    ) values (
      p_household_id,
      'post_journal_entry',
      p_idempotency_key,
      jsonb_build_object('journal_entry_id', v_entry_id, 'is_posted', true)
    )
    on conflict (household_id, contract_name, idempotency_key)
    do nothing;
  end if;

  return query select v_entry_id, false, true;
end;
$$;

alter table household_liquid_position_projection enable row level security;
alter table household_account_subtype_projection enable row level security;
alter table household_unread_notifications_projection enable row level security;
alter table projection_reconciliation_runs enable row level security;

drop policy if exists "view household liquid projection" on household_liquid_position_projection;

create policy "view household liquid projection" on household_liquid_position_projection for select
  using (exists (
    select 1 from household_members hm where hm.household_id = household_liquid_position_projection.household_id and hm.user_id = auth.uid()
  ));

drop policy if exists "view household account projection" on household_account_subtype_projection;

create policy "view household account projection" on household_account_subtype_projection for select
  using (exists (
    select 1 from household_members hm where hm.household_id = household_account_subtype_projection.household_id and hm.user_id = auth.uid()
  ));

drop policy if exists "view own unread projection" on household_unread_notifications_projection;

create policy "view own unread projection" on household_unread_notifications_projection for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from household_members hm where hm.household_id = household_unread_notifications_projection.household_id and hm.user_id = auth.uid()
    )
  );

drop policy if exists "view household projection reconciliations" on projection_reconciliation_runs;

create policy "view household projection reconciliations" on projection_reconciliation_runs for select
  using (exists (
    select 1 from household_members hm where hm.household_id = projection_reconciliation_runs.household_id and hm.user_id = auth.uid()
  ));

select cron.schedule(
  'projection-reconciliation-daily',
  '30 2 * * *',
  $$select reconcile_household_projections(null)$$
);

-- Initial deterministic build of all projections.
select rebuild_household_projections(null);
