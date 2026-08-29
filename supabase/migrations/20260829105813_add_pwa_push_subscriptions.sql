begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) between 20 and 2048
    and endpoint ~ '^https://'
  ),
  p256dh text not null check (char_length(p256dh) between 40 and 256),
  auth text not null check (char_length(auth) between 8 and 128),
  user_agent text not null default '' check (char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.push_notification_claims (
  event_key text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_household_idx
  on public.push_subscriptions (household_id);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);
create index if not exists push_notification_claims_household_idx
  on private.push_notification_claims (household_id, created_at desc);

create or replace function private.prepare_push_subscription()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_household uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  current_household := private.current_household_id();
  if current_household is null then
    raise exception 'Household membership required';
  end if;

  new.user_id := current_user_id;
  new.household_id := current_household;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists push_subscriptions_prepare on public.push_subscriptions;
create trigger push_subscriptions_prepare
before insert or update on public.push_subscriptions
for each row execute function private.prepare_push_subscription();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_user_read on public.push_subscriptions;
create policy push_subscriptions_user_read
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_user_insert on public.push_subscriptions;
create policy push_subscriptions_user_insert
on public.push_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and household_id = private.current_household_id()
);

drop policy if exists push_subscriptions_user_update on public.push_subscriptions;
create policy push_subscriptions_user_update
on public.push_subscriptions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and household_id = private.current_household_id()
);

drop policy if exists push_subscriptions_user_delete on public.push_subscriptions;
create policy push_subscriptions_user_delete
on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.get_household_push_subscriptions(
  automation_secret text,
  target_household_id uuid
)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;

  return query
  select subscription.endpoint, subscription.p256dh, subscription.auth
  from public.push_subscriptions as subscription
  where subscription.household_id = target_household_id;
end
$$;

create or replace function public.claim_recurring_push_jobs(
  automation_secret text
)
returns table (
  household_id uuid,
  generated_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_in_seoul date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;

  return query
  with candidates as (
    select
      transaction.household_id as candidate_household_id,
      count(*)::integer as candidate_count
    from public.transactions as transaction
    where transaction.date = today_in_seoul
      and transaction.recurring_rule_id is not null
    group by transaction.household_id
  ),
  claimed as (
    insert into private.push_notification_claims (event_key, household_id)
    select
      'recurring:' || today_in_seoul::text || ':' || candidate.candidate_household_id::text,
      candidate.candidate_household_id
    from candidates as candidate
    on conflict (event_key) do nothing
    returning household_id
  )
  select candidate.candidate_household_id, candidate.candidate_count
  from candidates as candidate
  join claimed on claimed.household_id = candidate.candidate_household_id;
end
$$;

create or replace function public.remove_stale_push_subscription(
  automation_secret text,
  target_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  if not private.verify_automation_secret(automation_secret) then
    raise exception 'Invalid automation secret';
  end if;

  delete from public.push_subscriptions as subscription
  where subscription.endpoint = target_endpoint;
  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end
$$;

revoke all on function private.prepare_push_subscription() from public, anon;
revoke all on function public.get_household_push_subscriptions(text, uuid)
  from public, authenticated;
revoke all on function public.claim_recurring_push_jobs(text)
  from public, authenticated;
revoke all on function public.remove_stale_push_subscription(text, text)
  from public, authenticated;
grant execute on function public.get_household_push_subscriptions(text, uuid)
  to anon;
grant execute on function public.claim_recurring_push_jobs(text)
  to anon;
grant execute on function public.remove_stale_push_subscription(text, text)
  to anon;

commit;
