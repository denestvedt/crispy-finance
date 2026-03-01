-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- Households
create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Household members (links auth.users to households)
create table household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null,
  pay_schedule text check (pay_schedule in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  pay_day_1 int,
  pay_day_2 int,
  gross_annual_salary numeric(12,2) default 0,
  effective_daily_rate numeric(12,4) generated always as (gross_annual_salary / 365.0) stored,
  created_at timestamptz default now(),
  unique(household_id, user_id)
);

-- Chart of accounts per household
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  account_subtype text not null,
  liquidity_tier text check (liquidity_tier in ('cash_equivalent', 'near_liquid', 'illiquid')),
  name text not null,
  external_account_id text,
  plaid_item_id text,
  plaid_access_token text,
  is_system boolean default false,
  is_active boolean default true,
  current_balance numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table journal_entries (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  entry_date date not null default current_date,
  effective_date date not null default current_date,
  description text not null,
  entry_type text not null check (entry_type in ('transaction', 'accrual', 'close', 'adjustment', 'provision', 'income_accrual')),
  source text not null check (source in ('plaid', 'manual', 'document_upload', 'system_accrual', 'period_close')),
  is_posted boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table journal_lines (
  id uuid primary key default uuid_generate_v4(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id),
  amount numeric(12,2) not null check (amount > 0),
  side text not null check (side in ('debit', 'credit')),
  memo text,
  created_at timestamptz default now()
);

create or replace function check_journal_balance()
returns trigger as $$
declare
  total_debits numeric;
  total_credits numeric;
begin
  if new.is_posted = true then
    select
      coalesce(sum(case when side = 'debit' then amount else 0 end), 0),
      coalesce(sum(case when side = 'credit' then amount else 0 end), 0)
    into total_debits, total_credits
    from journal_lines
    where journal_entry_id = new.id;

    if total_debits <> total_credits then
      raise exception 'Journal entry % does not balance: debits=% credits=%',
        new.id, total_debits, total_credits;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_journal_balance
  before update of is_posted on journal_entries
  for each row execute function check_journal_balance();

create table obligations (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  obligation_type text not null check (obligation_type in ('recurring', 'irregular', 'contingent')),
  frequency text check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one_time')),
  estimated_amount numeric(12,2) not null,
  probability numeric(3,2) default 1.0 check (probability between 0 and 1),
  next_due_date date,
  accrual_account_id uuid references accounts(id),
  expense_account_id uuid references accounts(id),
  is_active boolean default true,
  created_at timestamptz default now()
);

create table accrual_schedule (
  id uuid primary key default uuid_generate_v4(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  scheduled_date date not null,
  amount numeric(12,2) not null,
  journal_entry_id uuid references journal_entries(id),
  status text default 'pending' check (status in ('pending', 'posted', 'reversed')),
  created_at timestamptz default now()
);

create table balance_sheet_snapshots (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  snapshot_date date not null,
  account_id uuid not null references accounts(id),
  balance numeric(12,2) not null,
  created_at timestamptz default now()
);

create table home_valuations (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  estimated_value numeric(12,2) not null,
  valuation_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table plaid_items (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  plaid_item_id text not null unique,
  plaid_access_token text not null,
  institution_name text,
  status text default 'active' check (status in ('active', 'error', 'disconnected')),
  last_synced_at timestamptz,
  error_code text,
  created_at timestamptz default now()
);

create table document_uploads (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  file_name text not null,
  file_type text not null,
  storage_path text not null,
  parse_status text default 'pending' check (parse_status in ('pending', 'processing', 'complete', 'failed')),
  parsed_entries_count int default 0,
  error_message text,
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null,
  title text not null,
  body text not null,
  data jsonb,
  is_read boolean default false,
  sent_email boolean default false,
  sent_push boolean default false,
  created_at timestamptz default now()
);

create table notification_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  low_liquid_position_threshold numeric(12,2) default 1000,
  accrued_liability_threshold numeric(12,2) default 5000,
  large_transaction_threshold numeric(12,2) default 500,
  budget_review_day_of_month int default 1,
  email_enabled boolean default true,
  push_enabled boolean default true,
  created_at timestamptz default now()
);
