-- RLS hardening: explicit least-privilege policies with WITH CHECK on write paths.

-- accounts
alter policy "update household accounts" on accounts
  using (household_id in (select get_my_household_ids()))
  with check (household_id in (select get_my_household_ids()));

-- journal_entries
create policy "update household journal entries" on journal_entries for update
  using (household_id in (select get_my_household_ids()))
  with check (household_id in (select get_my_household_ids()));

-- household_members
alter policy "insert own membership" on household_members for insert
  with check (
    user_id = auth.uid()
    and household_id in (select get_my_household_ids())
  );

create policy "update own household membership" on household_members for update
  using (user_id = auth.uid() and household_id in (select get_my_household_ids()))
  with check (user_id = auth.uid() and household_id in (select get_my_household_ids()));

-- journal_lines
create policy "update journal lines" on journal_lines for update
  using (journal_entry_id in (
    select id from journal_entries where household_id in (select get_my_household_ids())
  ))
  with check (journal_entry_id in (
    select id from journal_entries where household_id in (select get_my_household_ids())
  ));

-- obligations: replace broad FOR ALL policy with explicit actions.
drop policy if exists "manage obligations" on obligations;

create policy "insert obligations" on obligations for insert
  with check (household_id in (select get_my_household_ids()));

create policy "update obligations" on obligations for update
  using (household_id in (select get_my_household_ids()))
  with check (household_id in (select get_my_household_ids()));

create policy "delete obligations" on obligations for delete
  using (household_id in (select get_my_household_ids()));

-- notifications
alter policy "update own notifications" on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notification_preferences: replace broad FOR ALL policy with explicit actions.
drop policy if exists "manage own preferences" on notification_preferences;

create policy "insert own preferences" on notification_preferences for insert
  with check (user_id = auth.uid());

create policy "update own preferences" on notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own preferences" on notification_preferences for delete
  using (user_id = auth.uid());

-- Timeline and tenant-oriented index coverage.
create index if not exists idx_accounts_household_created_at_desc
  on accounts (household_id, created_at desc);

create index if not exists idx_journal_entries_household_created_at_desc
  on journal_entries (household_id, created_at desc);

create index if not exists idx_obligations_household_created_at_desc
  on obligations (household_id, created_at desc);

create index if not exists idx_document_uploads_household_created_at_desc
  on document_uploads (household_id, created_at desc);

create index if not exists idx_home_valuations_household_created_at_desc
  on home_valuations (household_id, created_at desc);

create index if not exists idx_snapshots_household_created_at_desc
  on balance_sheet_snapshots (household_id, created_at desc);

create index if not exists idx_notifications_household_read_created_at_desc
  on notifications (household_id, is_read, created_at desc);

-- Snapshot strategy for historical reads.
create unique index if not exists idx_snapshots_household_date_account_unique
  on balance_sheet_snapshots (household_id, snapshot_date, account_id);

create or replace function create_balance_sheet_snapshot(
  p_household_id uuid default null,
  p_snapshot_date date default current_date
)
returns table(snapshot_rows int)
language plpgsql
security definer
as $$
declare
  v_rows int := 0;
begin
  insert into balance_sheet_snapshots (household_id, snapshot_date, account_id, balance, balance_cents)
  select
    a.household_id,
    p_snapshot_date,
    a.id,
    a.current_balance,
    a.current_balance_cents
  from accounts a
  where p_household_id is null or a.household_id = p_household_id
  on conflict (household_id, snapshot_date, account_id)
  do update set
    balance = excluded.balance,
    balance_cents = excluded.balance_cents,
    created_at = now();

  get diagnostics v_rows = row_count;

  return query select v_rows;
end;
$$;

create or replace view ledger_entries_hot_window as
select *
from journal_entries
where effective_date >= (current_date - interval '180 days');

create or replace function get_balance_sheet_as_of(
  p_household_id uuid,
  p_as_of date
)
returns table(
  account_id uuid,
  balance numeric,
  balance_cents bigint,
  source text,
  snapshot_date date
)
language sql
security definer
as $$
  with nearest_snapshot as (
    select max(snapshot_date) as snapshot_date
    from balance_sheet_snapshots
    where household_id = p_household_id
      and snapshot_date <= p_as_of
  )
  select
    bss.account_id,
    bss.balance,
    bss.balance_cents,
    'snapshot'::text,
    bss.snapshot_date
  from balance_sheet_snapshots bss
  join nearest_snapshot ns on ns.snapshot_date = bss.snapshot_date
  where bss.household_id = p_household_id;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'nightly-balance-sheet-snapshot') then
    perform cron.schedule(
      'nightly-balance-sheet-snapshot',
      '15 0 * * *',
      $$select create_balance_sheet_snapshot(null, current_date)$$
    );
  end if;
end;
$$;
