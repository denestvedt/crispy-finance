-- High-write ledger indexes
create index if not exists idx_journal_entries_household_effective_posted
  on journal_entries (household_id, effective_date, is_posted);

create index if not exists idx_journal_lines_entry_account
  on journal_lines (journal_entry_id, account_id);

create index if not exists idx_accounts_household_type_subtype
  on accounts (household_id, account_type, account_subtype);

-- Integer cent columns for compute paths (numeric columns remain for reporting)
alter table accounts
  add column if not exists current_balance_cents bigint;

alter table journal_lines
  add column if not exists amount_cents bigint;

alter table obligations
  add column if not exists estimated_amount_cents bigint;

alter table accrual_schedule
  add column if not exists amount_cents bigint;

alter table balance_sheet_snapshots
  add column if not exists balance_cents bigint;

alter table home_valuations
  add column if not exists estimated_value_cents bigint;

alter table notification_preferences
  add column if not exists low_liquid_position_threshold_cents bigint,
  add column if not exists accrued_liability_threshold_cents bigint,
  add column if not exists large_transaction_threshold_cents bigint;

update accounts
set current_balance_cents = round(current_balance * 100)::bigint
where current_balance_cents is null;

update journal_lines
set amount_cents = round(amount * 100)::bigint
where amount_cents is null;

update obligations
set estimated_amount_cents = round(estimated_amount * 100)::bigint
where estimated_amount_cents is null;

update accrual_schedule
set amount_cents = round(amount * 100)::bigint
where amount_cents is null;

update balance_sheet_snapshots
set balance_cents = round(balance * 100)::bigint
where balance_cents is null;

update home_valuations
set estimated_value_cents = round(estimated_value * 100)::bigint
where estimated_value_cents is null;

update notification_preferences
set
  low_liquid_position_threshold_cents = round(low_liquid_position_threshold * 100)::bigint,
  accrued_liability_threshold_cents = round(accrued_liability_threshold * 100)::bigint,
  large_transaction_threshold_cents = round(large_transaction_threshold * 100)::bigint
where low_liquid_position_threshold_cents is null
   or accrued_liability_threshold_cents is null
   or large_transaction_threshold_cents is null;

alter table accounts
  alter column current_balance_cents set not null,
  alter column current_balance_cents set default 0,
  add constraint chk_accounts_balance_cents_sync
    check (current_balance = (current_balance_cents::numeric / 100));

alter table journal_lines
  alter column amount_cents set not null,
  add constraint chk_journal_lines_amount_cents_positive check (amount_cents > 0),
  add constraint chk_journal_lines_amount_cents_sync
    check (amount = (amount_cents::numeric / 100));

alter table obligations
  alter column estimated_amount_cents set not null,
  add constraint chk_obligations_amount_cents_positive check (estimated_amount_cents > 0),
  add constraint chk_obligations_amount_cents_sync
    check (estimated_amount = (estimated_amount_cents::numeric / 100));

alter table accrual_schedule
  alter column amount_cents set not null,
  add constraint chk_accrual_schedule_amount_cents_positive check (amount_cents > 0),
  add constraint chk_accrual_schedule_amount_cents_sync
    check (amount = (amount_cents::numeric / 100));

alter table balance_sheet_snapshots
  alter column balance_cents set not null,
  add constraint chk_snapshots_balance_cents_sync
    check (balance = (balance_cents::numeric / 100));

alter table home_valuations
  alter column estimated_value_cents set not null,
  add constraint chk_home_valuations_amount_cents_positive check (estimated_value_cents > 0),
  add constraint chk_home_valuations_amount_cents_sync
    check (estimated_value = (estimated_value_cents::numeric / 100));

alter table notification_preferences
  alter column low_liquid_position_threshold_cents set not null,
  alter column low_liquid_position_threshold_cents set default 100000,
  alter column accrued_liability_threshold_cents set not null,
  alter column accrued_liability_threshold_cents set default 500000,
  alter column large_transaction_threshold_cents set not null,
  alter column large_transaction_threshold_cents set default 50000,
  add constraint chk_notification_pref_low_liquid_cents_sync
    check (low_liquid_position_threshold = (low_liquid_position_threshold_cents::numeric / 100)),
  add constraint chk_notification_pref_accrued_liability_cents_sync
    check (accrued_liability_threshold = (accrued_liability_threshold_cents::numeric / 100)),
  add constraint chk_notification_pref_large_tx_cents_sync
    check (large_transaction_threshold = (large_transaction_threshold_cents::numeric / 100));

-- Append-only guarantees for posted ledger entries
create or replace function prevent_journal_line_mutation()
returns trigger as $$
begin
  raise exception 'journal_lines are append-only; updates and deletes are not allowed';
end;
$$ language plpgsql;

create trigger trg_prevent_journal_line_update
  before update on journal_lines
  for each row execute function prevent_journal_line_mutation();

create trigger trg_prevent_journal_line_delete
  before delete on journal_lines
  for each row execute function prevent_journal_line_mutation();

create or replace function protect_posted_journal_entries()
returns trigger as $$
begin
  if old.is_posted then
    if new.household_id <> old.household_id
      or new.entry_date <> old.entry_date
      or new.effective_date <> old.effective_date
      or new.description <> old.description
      or new.entry_type <> old.entry_type
      or new.source <> old.source
      or new.is_posted <> old.is_posted then
      raise exception 'posted journal_entries are immutable for key fields';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_protect_posted_journal_entries
  before update on journal_entries
  for each row execute function protect_posted_journal_entries();

-- Idempotency keys for ingestion paths
create table if not exists ingestion_idempotency_keys (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  source text not null check (source in ('plaid_transaction', 'plaid_webhook', 'document_parse')),
  source_event_id text not null,
  payload_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  journal_entry_id uuid references journal_entries(id),
  unique (source, source_event_id)
);

create index if not exists idx_ingestion_idempotency_household_source
  on ingestion_idempotency_keys (household_id, source);
