create table if not exists api_idempotency_keys (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  contract_name text not null,
  idempotency_key text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (household_id, contract_name, idempotency_key)
);

create index if not exists idx_api_idempotency_household_contract
  on api_idempotency_keys (household_id, contract_name);

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

create or replace function calculate_true_liquid_position(
  p_household_id uuid,
  p_as_of date default current_date
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
  with scoped_accounts as (
    select *
    from accounts
    where household_id = p_household_id
  ),
  metrics as (
    select
      coalesce(sum(current_balance) filter (where account_type = 'asset' and liquidity_tier in ('cash_equivalent', 'near_liquid')), 0) as gross_cash,
      coalesce(sum(current_balance) filter (where account_type = 'liability' and account_subtype = 'accrued_liability'), 0) as accrued_liabilities,
      coalesce(sum(current_balance) filter (where account_type = 'liability' and account_subtype = 'current_liability'), 0) as outstanding_credit_balances
    from scoped_accounts
  ),
  obligation_metrics as (
    select coalesce(sum(estimated_amount), 0) as provisioned_obligations
    from obligations
    where household_id = p_household_id
      and is_active = true
      and next_due_date <= p_as_of
  )
  select
    m.gross_cash,
    m.accrued_liabilities,
    m.outstanding_credit_balances,
    o.provisioned_obligations,
    (m.gross_cash - m.accrued_liabilities - m.outstanding_credit_balances - o.provisioned_obligations) as true_liquid_position,
    now()
  from metrics m
  cross join obligation_metrics o;
$$;

create or replace function run_daily_accruals(
  p_household_id uuid default null,
  p_run_date date default current_date
)
returns table (posted_count int, posted_total_cents bigint)
language plpgsql
security definer
as $$
declare
  v_schedule record;
  v_entry_id uuid;
  v_total bigint := 0;
  v_count int := 0;
begin
  for v_schedule in
    select s.id, s.amount_cents, o.household_id, o.accrual_account_id, o.expense_account_id, o.name
    from accrual_schedule s
    join obligations o on o.id = s.obligation_id
    where s.status = 'pending'
      and s.scheduled_date <= p_run_date
      and (p_household_id is null or o.household_id = p_household_id)
  loop
    select journal_entry_id
    into v_entry_id
    from post_journal_entry(
      p_household_id := v_schedule.household_id,
      p_entry_date := p_run_date,
      p_effective_date := p_run_date,
      p_description := 'Daily accrual: ' || v_schedule.name,
      p_entry_type := 'accrual',
      p_source := 'system_accrual',
      p_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_schedule.expense_account_id, 'amount_cents', v_schedule.amount_cents, 'side', 'debit'),
        jsonb_build_object('account_id', v_schedule.accrual_account_id, 'amount_cents', v_schedule.amount_cents, 'side', 'credit')
      )
    );

    update accrual_schedule
    set status = 'posted',
        journal_entry_id = v_entry_id
    where id = v_schedule.id;

    v_count := v_count + 1;
    v_total := v_total + v_schedule.amount_cents;
  end loop;

  return query select v_count, v_total;
end;
$$;

create or replace function close_period(
  p_household_id uuid,
  p_period_end date,
  p_idempotency_key text default null
)
returns table (close_entry_id uuid, replayed boolean, net_income_cents bigint)
language plpgsql
security definer
as $$
declare
  v_period_start date := date_trunc('month', p_period_end)::date;
  v_net_income_cents bigint := 0;
  v_current_period_account uuid;
  v_retained_equity_account uuid;
  v_response jsonb;
  v_close_entry_id uuid;
begin
  if p_idempotency_key is not null then
    select response_payload
      into v_response
    from api_idempotency_keys
    where household_id = p_household_id
      and contract_name = 'close_period'
      and idempotency_key = p_idempotency_key;

    if v_response is not null then
      return query
      select
        (v_response ->> 'close_entry_id')::uuid,
        true,
        (v_response ->> 'net_income_cents')::bigint;
      return;
    end if;
  end if;

  select id into v_current_period_account
  from accounts
  where household_id = p_household_id
    and account_type = 'equity'
    and account_subtype = 'current_period_result'
  limit 1;

  select id into v_retained_equity_account
  from accounts
  where household_id = p_household_id
    and account_type = 'equity'
    and account_subtype = 'retained_equity'
  limit 1;

  if v_current_period_account is null or v_retained_equity_account is null then
    raise exception 'Required close accounts missing for household %', p_household_id;
  end if;

  select
    coalesce(sum(case
      when a.account_type = 'income' and jl.side = 'credit' then jl.amount_cents
      when a.account_type = 'income' and jl.side = 'debit' then -jl.amount_cents
      when a.account_type = 'expense' and jl.side = 'debit' then -jl.amount_cents
      when a.account_type = 'expense' and jl.side = 'credit' then jl.amount_cents
      else 0
    end), 0)
  into v_net_income_cents
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id
  join accounts a on a.id = jl.account_id
  where je.household_id = p_household_id
    and je.is_posted = true
    and je.effective_date between v_period_start and p_period_end
    and a.account_type in ('income', 'expense');

  if v_net_income_cents <> 0 then
    select journal_entry_id
    into v_close_entry_id
    from post_journal_entry(
      p_household_id := p_household_id,
      p_entry_date := p_period_end,
      p_effective_date := p_period_end,
      p_description := 'Period close ' || to_char(p_period_end, 'YYYY-MM'),
      p_entry_type := 'close',
      p_source := 'period_close',
      p_lines := case
        when v_net_income_cents > 0 then jsonb_build_array(
          jsonb_build_object('account_id', v_current_period_account, 'amount_cents', v_net_income_cents, 'side', 'debit'),
          jsonb_build_object('account_id', v_retained_equity_account, 'amount_cents', v_net_income_cents, 'side', 'credit')
        )
        else jsonb_build_array(
          jsonb_build_object('account_id', v_current_period_account, 'amount_cents', abs(v_net_income_cents), 'side', 'credit'),
          jsonb_build_object('account_id', v_retained_equity_account, 'amount_cents', abs(v_net_income_cents), 'side', 'debit')
        )
      end
    );
  end if;

  if p_idempotency_key is not null then
    insert into api_idempotency_keys (household_id, contract_name, idempotency_key, response_payload)
    values (
      p_household_id,
      'close_period',
      p_idempotency_key,
      jsonb_build_object('close_entry_id', v_close_entry_id, 'net_income_cents', v_net_income_cents)
    )
    on conflict (household_id, contract_name, idempotency_key) do nothing;
  end if;

  return query select v_close_entry_id, false, v_net_income_cents;
end;
$$;
