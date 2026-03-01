-- Run in staging with representative tenant data.
-- Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` outputs and commit updates over time.

-- 1) Dashboard: liquid position summary
explain (analyze, buffers)
select * from calculate_true_liquid_position('00000000-0000-0000-0000-000000000000'::uuid, current_date);

-- 2) Dashboard: account rollup by type
explain (analyze, buffers)
select account_type, sum(current_balance_cents)
from accounts
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
group by account_type;

-- 3) Ledger list page 1 (hot window)
explain (analyze, buffers)
select id, effective_date, description, created_at
from journal_entries
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and effective_date >= current_date - interval '180 days'
order by created_at desc
limit 50;

-- 4) Ledger list page N (keyset)
explain (analyze, buffers)
select id, effective_date, description, created_at
from journal_entries
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and created_at < now() - interval '7 days'
order by created_at desc
limit 50;

-- 5) Ledger detail lines by entry
explain (analyze, buffers)
select jl.*
from journal_lines jl
join journal_entries je on je.id = jl.journal_entry_id
where je.household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and je.id = '11111111-1111-1111-1111-111111111111'::uuid;

-- 6) Obligations calendar feed (next 90d)
explain (analyze, buffers)
select id, name, next_due_date, estimated_amount_cents
from obligations
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and is_active = true
  and next_due_date between current_date and (current_date + interval '90 days')
order by next_due_date asc;

-- 7) Obligations accrual schedule calendar
explain (analyze, buffers)
select s.id, s.scheduled_date, s.amount_cents, s.status
from accrual_schedule s
join obligations o on o.id = s.obligation_id
where o.household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and s.scheduled_date between current_date and (current_date + interval '90 days')
order by s.scheduled_date asc;

-- 8) Notifications unread-first feed page 1
explain (analyze, buffers)
select id, type, title, is_read, created_at
from notifications
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and user_id = '22222222-2222-2222-2222-222222222222'::uuid
order by is_read asc, created_at desc
limit 50;

-- 9) Notifications unread count
explain (analyze, buffers)
select count(*)
from notifications
where household_id = '00000000-0000-0000-0000-000000000000'::uuid
  and user_id = '22222222-2222-2222-2222-222222222222'::uuid
  and is_read = false;

-- 10) Historical balance sheet read from snapshots
explain (analyze, buffers)
select *
from get_balance_sheet_as_of('00000000-0000-0000-0000-000000000000'::uuid, current_date - interval '365 days');
