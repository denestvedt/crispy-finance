alter table households enable row level security;
alter table household_members enable row level security;
alter table accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table obligations enable row level security;
alter table accrual_schedule enable row level security;
alter table balance_sheet_snapshots enable row level security;
alter table home_valuations enable row level security;
alter table plaid_items enable row level security;
alter table document_uploads enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;

create or replace function get_my_household_ids()
returns setof uuid as $$
  select household_id from household_members where user_id = auth.uid()
$$ language sql security definer stable;

create policy "view own households" on households for select
  using (id in (select get_my_household_ids()));

create policy "view own household members" on household_members for select
  using (household_id in (select get_my_household_ids()));
create policy "insert own membership" on household_members for insert
  with check (user_id = auth.uid());

create policy "view household accounts" on accounts for select
  using (household_id in (select get_my_household_ids()));
create policy "insert household accounts" on accounts for insert
  with check (household_id in (select get_my_household_ids()));
create policy "update household accounts" on accounts for update
  using (household_id in (select get_my_household_ids()));

create policy "view household journal entries" on journal_entries for select
  using (household_id in (select get_my_household_ids()));
create policy "insert household journal entries" on journal_entries for insert
  with check (household_id in (select get_my_household_ids()));

create policy "view journal lines" on journal_lines for select
  using (journal_entry_id in (
    select id from journal_entries where household_id in (select get_my_household_ids())
  ));
create policy "insert journal lines" on journal_lines for insert
  with check (journal_entry_id in (
    select id from journal_entries where household_id in (select get_my_household_ids())
  ));

create policy "view obligations" on obligations for select
  using (household_id in (select get_my_household_ids()));
create policy "manage obligations" on obligations for all
  using (household_id in (select get_my_household_ids()));

create policy "view accrual schedule" on accrual_schedule for select
  using (obligation_id in (
    select id from obligations where household_id in (select get_my_household_ids())
  ));

create policy "view snapshots" on balance_sheet_snapshots for select
  using (household_id in (select get_my_household_ids()));

create policy "view home valuations" on home_valuations for select
  using (household_id in (select get_my_household_ids()));
create policy "insert home valuations" on home_valuations for insert
  with check (household_id in (select get_my_household_ids()));

create policy "view plaid items" on plaid_items for select
  using (household_id in (select get_my_household_ids()));

create policy "view document uploads" on document_uploads for select
  using (household_id in (select get_my_household_ids()));
create policy "insert document uploads" on document_uploads for insert
  with check (household_id in (select get_my_household_ids()));

create policy "view own notifications" on notifications for select
  using (user_id = auth.uid());
create policy "update own notifications" on notifications for update
  using (user_id = auth.uid());

create policy "view own preferences" on notification_preferences for select
  using (user_id = auth.uid());
create policy "manage own preferences" on notification_preferences for all
  using (user_id = auth.uid());
