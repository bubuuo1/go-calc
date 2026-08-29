begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  inputter text not null check (inputter in ('husband', 'wife')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id),
  unique (household_id, inputter)
);

create table if not exists private.household_claims (
  household_id uuid primary key references public.households(id) on delete cascade,
  token_hash bytea not null unique,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists private.household_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash bytea not null unique,
  inputter text not null check (inputter in ('husband', 'wife')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists inputter text not null default 'husband',
  add column if not exists household_id uuid,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_inputter_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_inputter_check
      check (inputter in ('husband', 'wife'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'transactions_household_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'transactions_created_by_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end $$;

do $$
declare
  legacy_household_id uuid;
begin
  if exists (select 1 from public.transactions) then
    select household_id
      into legacy_household_id
      from public.transactions
      where household_id is not null
      limit 1;

    if legacy_household_id is null then
      select id
        into legacy_household_id
        from public.households
        where name = '솔샘네' and created_by is null
        order by created_at
        limit 1;
    end if;

    if legacy_household_id is null then
      insert into public.households (name)
      values ('솔샘네')
      returning id into legacy_household_id;
    end if;

    update public.transactions
      set household_id = legacy_household_id
      where household_id is null;

    insert into private.household_claims (household_id, token_hash)
    values (
      legacy_household_id,
      decode('43ec0f7ca5fe248ca68f761c37a728502532458644ce3668ef2c060aaca9e831', 'hex')
    )
    on conflict (household_id) do nothing;
  end if;
end $$;

alter table public.transactions alter column household_id set not null;

create table if not exists public.recurring_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  payment_method text not null check (payment_method in ('cash', 'card')),
  inputter text not null check (inputter in ('husband', 'wife')),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  amount numeric not null check (amount > 0),
  memo text not null default '' check (char_length(memo) <= 200),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date,
  next_due_date date not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

alter table public.transactions add column if not exists recurring_rule_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_recurring_rule_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_recurring_rule_id_fkey
      foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;
  end if;
end $$;

create table if not exists public.recurring_occurrences (
  rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  occurrence_date date not null,
  transaction_id text not null unique references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rule_id, occurrence_date)
);

create table if not exists public.export_schedules (
  household_id uuid primary key references public.households(id) on delete cascade,
  recipient_email text not null check (
    char_length(recipient_email) between 3 and 254
    and recipient_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  format text not null default 'xlsx' check (format in ('csv', 'xlsx')),
  send_day integer not null default 1 check (send_day between 1 and 28),
  active boolean not null default false,
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  last_sent_period text check (last_sent_period is null or last_sent_period ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.automation_secrets (
  key text primary key,
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);

insert into private.automation_secrets (key, secret_hash)
values (
  'primary',
  decode('cb9ccef0d2f4ad58bd216ef03d81ffeae268a8dcb7129356ab8d6825e15df44c', 'hex')
)
on conflict (key) do update
set secret_hash = excluded.secret_hash,
    updated_at = now();

create index if not exists transactions_household_date_idx
  on public.transactions (household_id, date desc, id desc);
create index if not exists transactions_created_by_idx
  on public.transactions (created_by) where created_by is not null;
create index if not exists transactions_recurring_rule_idx
  on public.transactions (recurring_rule_id) where recurring_rule_id is not null;
create index if not exists recurring_rules_due_idx
  on public.recurring_rules (next_due_date, household_id) where active;
create index if not exists recurring_rules_household_idx
  on public.recurring_rules (household_id);
create index if not exists recurring_rules_created_by_idx
  on public.recurring_rules (created_by);
create index if not exists household_members_household_idx
  on public.household_members (household_id);
create index if not exists households_created_by_idx
  on public.households (created_by) where created_by is not null;
create index if not exists household_invites_household_idx
  on private.household_invites (household_id, expires_at desc);
create index if not exists household_invites_created_by_idx
  on private.household_invites (created_by);
create index if not exists household_invites_accepted_by_idx
  on private.household_invites (accepted_by) where accepted_by is not null;
create index if not exists household_claims_claimed_by_idx
  on private.household_claims (claimed_by) where claimed_by is not null;

create or replace function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.household_id
  from public.household_members as member
  where member.user_id = auth.uid()
  limit 1
$$;

create or replace function private.current_inputter()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.inputter
  from public.household_members as member
  where member.user_id = auth.uid()
  limit 1
$$;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = target_household_id
      and member.user_id = auth.uid()
  )
$$;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = target_household_id
      and member.user_id = auth.uid()
      and member.role = 'owner'
  )
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function private.occurrence_date_for_month(month_date date, target_day integer)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  select make_date(
    extract(year from month_date)::integer,
    extract(month from month_date)::integer,
    least(
      target_day,
      extract(day from (date_trunc('month', month_date) + interval '1 month - 1 day'))::integer
    )
  )
$$;

create or replace function private.first_recurring_due(
  start_on date,
  target_day integer,
  reference_on date
)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  anchor_date date := greatest(start_on, reference_on);
  candidate date;
begin
  candidate := private.occurrence_date_for_month(anchor_date, target_day);
  if candidate < anchor_date then
    candidate := private.occurrence_date_for_month(
      (date_trunc('month', anchor_date) + interval '1 month')::date,
      target_day
    );
  end if;
  return candidate;
end
$$;

create or replace function private.prepare_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_household_id uuid;
  member_inputter text;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    member_household_id := private.current_household_id();
    member_inputter := private.current_inputter();
    if member_household_id is null or member_inputter is null then
      raise exception 'Household membership is required';
    end if;
    new.household_id := member_household_id;
    new.created_by := auth.uid();
    new.inputter := member_inputter;
    new.recurring_rule_id := null;
  elsif tg_op = 'UPDATE' then
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.inputter := old.inputter;
    new.recurring_rule_id := old.recurring_rule_id;
  end if;

  new.updated_at := now();
  return new;
end
$$;

create or replace function private.prepare_recurring_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_in_seoul date := (now() at time zone 'Asia/Seoul')::date;
  member_household_id uuid;
  member_inputter text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      member_household_id := private.current_household_id();
      member_inputter := private.current_inputter();
      if member_household_id is null or member_inputter is null then
        raise exception 'Household membership is required';
      end if;
      new.household_id := member_household_id;
      new.created_by := auth.uid();
      new.inputter := member_inputter;
    end if;
    new.next_due_date := private.first_recurring_due(new.start_date, new.day_of_month, today_in_seoul);
  else
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.inputter := old.inputter;
    if new.start_date is distinct from old.start_date
      or new.day_of_month is distinct from old.day_of_month
      or (not old.active and new.active) then
      new.next_due_date := private.first_recurring_due(new.start_date, new.day_of_month, today_in_seoul);
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

create or replace function private.prepare_export_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_household_id uuid;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    member_household_id := private.current_household_id();
    if member_household_id is null then
      raise exception 'Household membership is required';
    end if;
    new.household_id := member_household_id;
  elsif tg_op = 'UPDATE' then
    new.household_id := old.household_id;
  end if;
  new.timezone := 'Asia/Seoul';
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists households_touch_updated_at on public.households;
create trigger households_touch_updated_at
before update on public.households
for each row execute function private.touch_updated_at();

drop trigger if exists transactions_prepare on public.transactions;
create trigger transactions_prepare
before insert or update on public.transactions
for each row execute function private.prepare_transaction();

drop trigger if exists recurring_rules_prepare on public.recurring_rules;
create trigger recurring_rules_prepare
before insert or update on public.recurring_rules
for each row execute function private.prepare_recurring_rule();

drop trigger if exists export_schedules_prepare on public.export_schedules;
create trigger export_schedules_prepare
before insert or update on public.export_schedules
for each row execute function private.prepare_export_schedule();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.export_schedules enable row level security;

drop policy if exists households_member_read on public.households;
create policy households_member_read
on public.households for select to authenticated
using (id = private.current_household_id());

drop policy if exists household_members_household_read on public.household_members;
create policy household_members_household_read
on public.household_members for select to authenticated
using (household_id = private.current_household_id());

drop policy if exists "Allow public read transactions" on public.transactions;
drop policy if exists "Allow public insert transactions" on public.transactions;
drop policy if exists "Allow public update transactions" on public.transactions;
drop policy if exists "Allow public delete transactions" on public.transactions;
drop policy if exists transactions_member_read on public.transactions;
drop policy if exists transactions_member_insert on public.transactions;
drop policy if exists transactions_member_update on public.transactions;
drop policy if exists transactions_member_delete on public.transactions;

create policy transactions_member_read
on public.transactions for select to authenticated
using (private.is_household_member(household_id));

create policy transactions_member_insert
on public.transactions for insert to authenticated
with check (
  household_id = private.current_household_id()
  and created_by = (select auth.uid())
  and inputter = private.current_inputter()
);

create policy transactions_member_update
on public.transactions for update to authenticated
using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy transactions_member_delete
on public.transactions for delete to authenticated
using (private.is_household_member(household_id));

drop policy if exists recurring_rules_member_all on public.recurring_rules;
create policy recurring_rules_member_all
on public.recurring_rules for all to authenticated
using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

drop policy if exists recurring_occurrences_member_read on public.recurring_occurrences;
create policy recurring_occurrences_member_read
on public.recurring_occurrences for select to authenticated
using (
  exists (
    select 1
    from public.recurring_rules as rule
    where rule.id = rule_id
      and private.is_household_member(rule.household_id)
  )
);

drop policy if exists export_schedules_member_all on public.export_schedules;
create policy export_schedules_member_all
on public.export_schedules for all to authenticated
using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.recurring_rules from anon, authenticated;
revoke all on public.recurring_occurrences from anon, authenticated;
revoke all on public.export_schedules from anon, authenticated;

grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select on public.recurring_occurrences to authenticated;
grant select, insert, update, delete on public.export_schedules to authenticated;

grant usage on schema private to authenticated;
revoke all on function private.current_household_id() from public, anon;
revoke all on function private.current_inputter() from public, anon;
revoke all on function private.is_household_member(uuid) from public, anon;
revoke all on function private.is_household_owner(uuid) from public, anon;
grant execute on function private.current_household_id() to authenticated;
grant execute on function private.current_inputter() to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;

create or replace function public.claim_legacy_household(
  claim_code text,
  p_display_name text,
  p_inputter text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  claim_row private.household_claims%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    raise exception 'Display name is invalid';
  end if;
  if p_inputter not in ('husband', 'wife') then
    raise exception 'Inputter is invalid';
  end if;
  if exists (select 1 from public.household_members where user_id = current_user_id) then
    raise exception 'User already belongs to a household';
  end if;

  select * into claim_row
  from private.household_claims
  where token_hash = extensions.digest(upper(btrim(coalesce(claim_code, ''))), 'sha256')
    and claimed_at is null
  for update;

  if not found then
    raise exception 'Claim code is invalid or already used';
  end if;

  insert into public.household_members (
    household_id, user_id, role, display_name, inputter
  ) values (
    claim_row.household_id, current_user_id, 'owner', btrim(p_display_name), p_inputter
  );

  update public.households
    set created_by = current_user_id
    where id = claim_row.household_id;

  update private.household_claims
    set claimed_at = now(), claimed_by = current_user_id
    where household_id = claim_row.household_id;

  return claim_row.household_id;
end
$$;

create or replace function public.create_household(
  p_name text,
  p_display_name text,
  p_inputter text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Household name is invalid';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    raise exception 'Display name is invalid';
  end if;
  if p_inputter not in ('husband', 'wife') then
    raise exception 'Inputter is invalid';
  end if;
  if exists (select 1 from public.household_members where user_id = current_user_id) then
    raise exception 'User already belongs to a household';
  end if;

  insert into public.households (name, created_by)
  values (btrim(p_name), current_user_id)
  returning id into new_household_id;

  insert into public.household_members (
    household_id, user_id, role, display_name, inputter
  ) values (
    new_household_id, current_user_id, 'owner', btrim(p_display_name), p_inputter
  );

  return new_household_id;
end
$$;

create or replace function public.create_household_invite(p_inputter text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  invite_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_inputter not in ('husband', 'wife') then
    raise exception 'Inputter is invalid';
  end if;

  select household_id into current_household_id
  from public.household_members
  where user_id = current_user_id and role = 'owner';

  if current_household_id is null then
    raise exception 'Only the household owner can create invites';
  end if;
  if exists (
    select 1 from public.household_members
    where household_id = current_household_id and inputter = p_inputter
  ) then
    raise exception 'That household role is already occupied';
  end if;

  delete from private.household_invites
  where household_id = current_household_id
    and inputter = p_inputter
    and accepted_at is null;

  invite_code := 'GC-' || upper(encode(extensions.gen_random_bytes(12), 'hex'));

  insert into private.household_invites (
    household_id, token_hash, inputter, created_by, expires_at
  ) values (
    current_household_id,
    extensions.digest(invite_code, 'sha256'),
    p_inputter,
    current_user_id,
    now() + interval '7 days'
  );

  return invite_code;
end
$$;

create or replace function public.accept_household_invite(
  invite_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row private.household_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    raise exception 'Display name is invalid';
  end if;
  if exists (select 1 from public.household_members where user_id = current_user_id) then
    raise exception 'User already belongs to a household';
  end if;

  select * into invite_row
  from private.household_invites
  where token_hash = extensions.digest(upper(btrim(coalesce(invite_code, ''))), 'sha256')
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite code is invalid or expired';
  end if;

  insert into public.household_members (
    household_id, user_id, role, display_name, inputter
  ) values (
    invite_row.household_id, current_user_id, 'member', btrim(p_display_name), invite_row.inputter
  );

  update private.household_invites
    set accepted_at = now(), accepted_by = current_user_id
    where id = invite_row.id;

  return invite_row.household_id;
end
$$;

revoke all on function public.claim_legacy_household(text, text, text) from public, anon;
revoke all on function public.create_household(text, text, text) from public, anon;
revoke all on function public.create_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text, text) from public, anon;
grant execute on function public.claim_legacy_household(text, text, text) to authenticated;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.create_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text, text) to authenticated;

create or replace function private.verify_automation_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.automation_secrets as stored
    where stored.key = 'primary'
      and stored.secret_hash = extensions.digest(coalesce(candidate, ''), 'sha256')
  )
$$;

revoke all on function private.verify_automation_secret(text) from public, anon, authenticated;

create or replace function public.run_recurring_maintenance(automation_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_in_seoul date := (now() at time zone 'Asia/Seoul')::date;
  rule_row record;
  due_on date;
  transaction_key text;
  inserted_rows integer;
  generated_count integer := 0;
  processed_rules integer := 0;
  iteration_count integer;
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;

  for rule_row in
    select *
    from public.recurring_rules
    where active
      and next_due_date <= today_in_seoul
    order by next_due_date, id
    for update skip locked
  loop
    processed_rules := processed_rules + 1;
    due_on := rule_row.next_due_date;
    iteration_count := 0;

    while due_on <= today_in_seoul
      and (rule_row.end_date is null or due_on <= rule_row.end_date)
      and iteration_count < 120
    loop
      transaction_key := 'recurring:' || rule_row.id::text || ':' || due_on::text;

      insert into public.transactions (
        id, type, payment_method, inputter, category, amount, memo, date,
        household_id, created_by, recurring_rule_id
      ) values (
        transaction_key,
        rule_row.type,
        rule_row.payment_method,
        rule_row.inputter,
        rule_row.category,
        rule_row.amount,
        rule_row.memo,
        due_on,
        rule_row.household_id,
        rule_row.created_by,
        rule_row.id
      )
      on conflict (id) do nothing;

      get diagnostics inserted_rows = row_count;
      generated_count := generated_count + inserted_rows;

      insert into public.recurring_occurrences (rule_id, occurrence_date, transaction_id)
      values (rule_row.id, due_on, transaction_key)
      on conflict (rule_id, occurrence_date) do nothing;

      due_on := private.occurrence_date_for_month(
        (date_trunc('month', due_on) + interval '1 month')::date,
        rule_row.day_of_month
      );
      iteration_count := iteration_count + 1;
    end loop;

    update public.recurring_rules
    set next_due_date = due_on,
        active = case
          when rule_row.end_date is not null and due_on > rule_row.end_date then false
          else active
        end
    where id = rule_row.id;
  end loop;

  return jsonb_build_object(
    'date', today_in_seoul,
    'processedRules', processed_rules,
    'generatedTransactions', generated_count
  );
end
$$;

create or replace function public.get_due_export_jobs(automation_secret text)
returns table (
  household_id uuid,
  household_name text,
  recipient_email text,
  export_format text,
  period text,
  transaction_rows jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_in_seoul date := (now() at time zone 'Asia/Seoul')::date;
  period_start date := (date_trunc('month', today_in_seoul) - interval '1 month')::date;
  period_end date := date_trunc('month', today_in_seoul)::date;
  target_period text := to_char(period_start, 'YYYY-MM');
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;

  return query
  select
    schedule.household_id,
    household.name,
    schedule.recipient_email,
    schedule.format,
    target_period,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', transaction.id,
          'type', transaction.type,
          'paymentMethod', transaction.payment_method,
          'inputter', transaction.inputter,
          'category', transaction.category,
          'amount', transaction.amount,
          'memo', transaction.memo,
          'date', transaction.date
        ) order by transaction.date, transaction.id
      ) filter (where transaction.id is not null),
      '[]'::jsonb
    )
  from public.export_schedules as schedule
  join public.households as household on household.id = schedule.household_id
  left join public.transactions as transaction
    on transaction.household_id = schedule.household_id
    and transaction.date >= period_start
    and transaction.date < period_end
  where schedule.active
    and schedule.send_day <= extract(day from today_in_seoul)::integer
    and schedule.last_sent_period is distinct from target_period
  group by
    schedule.household_id,
    household.name,
    schedule.recipient_email,
    schedule.format;
end
$$;

create or replace function public.mark_export_sent(
  automation_secret text,
  target_household_id uuid,
  target_period text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;
  if target_period !~ '^\d{4}-\d{2}$' then
    raise exception 'Period is invalid';
  end if;

  update public.export_schedules
  set last_sent_period = target_period
  where household_id = target_household_id
    and last_sent_period is distinct from target_period;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end
$$;

revoke all on function public.run_recurring_maintenance(text) from public, authenticated;
revoke all on function public.get_due_export_jobs(text) from public, authenticated;
revoke all on function public.mark_export_sent(text, uuid, text) from public, authenticated;
grant execute on function public.run_recurring_maintenance(text) to anon;
grant execute on function public.get_due_export_jobs(text) to anon;
grant execute on function public.mark_export_sent(text, uuid, text) to anon;

commit;
