begin;

alter table private.household_invites
  add column if not exists invitee_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_invites_invitee_email_check'
      and conrelid = 'private.household_invites'::regclass
  ) then
    alter table private.household_invites
      add constraint household_invites_invitee_email_check
      check (
        invitee_email is null
        or (
          char_length(invitee_email) between 3 and 320
          and invitee_email = lower(btrim(invitee_email))
          and invitee_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      );
  end if;
end
$$;

create index if not exists household_invites_email_pending_idx
  on private.household_invites (invitee_email, expires_at desc)
  where invitee_email is not null and accepted_at is null;

create or replace function private.current_verified_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(auth_user.email))
  from auth.users as auth_user
  where auth_user.id = auth.uid()
    and auth_user.email_confirmed_at is not null
$$;

revoke all on function private.current_verified_email()
  from public, anon, authenticated;

create or replace function public.create_household_email_invite(
  p_invitee_email text,
  p_inputter text
)
returns table (
  invite_id uuid,
  invite_token text,
  household_name text,
  inviter_display_name text,
  invitee_email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
  current_household_id uuid;
  current_household_name text;
  current_display_name text;
  normalized_email text := lower(btrim(coalesce(p_invitee_email, '')));
  new_invite_id uuid;
  new_invite_token text;
  new_expires_at timestamptz := now() + interval '7 days';
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_inputter not in ('husband', 'wife') then
    raise exception 'Inputter is invalid';
  end if;
  if char_length(normalized_email) not between 3 and 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Invite email is invalid';
  end if;

  select
    member.household_id,
    household.name,
    member.display_name
  into
    current_household_id,
    current_household_name,
    current_display_name
  from public.household_members as member
  join public.households as household on household.id = member.household_id
  where member.user_id = current_user_id
    and member.role = 'owner';

  if current_household_id is null then
    raise exception 'Only the household owner can create invites';
  end if;

  current_user_email := private.current_verified_email();
  if current_user_email is not null and current_user_email = normalized_email then
    raise exception 'You cannot invite your own account';
  end if;

  if exists (
    select 1
    from public.household_members as member
    where member.household_id = current_household_id
      and member.inputter = p_inputter
  ) then
    raise exception 'That household role is already occupied';
  end if;

  delete from private.household_invites as invite
  where invite.household_id = current_household_id
    and invite.inputter = p_inputter
    and invite.accepted_at is null;

  new_invite_token :=
    'GI-' || upper(encode(extensions.gen_random_bytes(24), 'hex'));

  insert into private.household_invites (
    household_id,
    token_hash,
    inputter,
    created_by,
    invitee_email,
    expires_at
  ) values (
    current_household_id,
    extensions.digest(new_invite_token, 'sha256'),
    p_inputter,
    current_user_id,
    normalized_email,
    new_expires_at
  )
  returning id into new_invite_id;

  return query
  select
    new_invite_id,
    new_invite_token,
    current_household_name,
    current_display_name,
    normalized_email,
    new_expires_at;
end
$$;

create or replace function public.list_household_email_invites()
returns table (
  invite_id uuid,
  invitee_email text,
  inputter text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select member.household_id into current_household_id
  from public.household_members as member
  where member.user_id = current_user_id
    and member.role = 'owner';

  if current_household_id is null then
    raise exception 'Only the household owner can view invites';
  end if;

  return query
  select
    invite.id,
    invite.invitee_email,
    invite.inputter,
    invite.expires_at,
    invite.created_at
  from private.household_invites as invite
  where invite.household_id = current_household_id
    and invite.invitee_email is not null
    and invite.accepted_at is null
    and invite.expires_at > now()
  order by invite.created_at desc;
end
$$;

create or replace function public.cancel_household_email_invite(
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  delete from private.household_invites as invite
  where invite.id = p_invite_id
    and invite.created_by = current_user_id
    and invite.accepted_at is null;

  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end
$$;

create or replace function public.get_household_email_invite(
  p_invite_token text
)
returns table (
  household_name text,
  inviter_display_name text,
  invitee_email text,
  inputter text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  current_user_email := private.current_verified_email();
  if current_user_email is null then
    raise exception 'A verified email is required';
  end if;

  return query
  select
    household.name,
    coalesce(owner_member.display_name, '가족'),
    invite.invitee_email,
    invite.inputter,
    invite.expires_at
  from private.household_invites as invite
  join public.households as household on household.id = invite.household_id
  left join public.household_members as owner_member
    on owner_member.household_id = invite.household_id
    and owner_member.user_id = invite.created_by
  where invite.token_hash = extensions.digest(
      upper(btrim(coalesce(p_invite_token, ''))),
      'sha256'
    )
    and invite.invitee_email = current_user_email
    and invite.accepted_at is null
    and invite.expires_at > now();
end
$$;

create or replace function public.accept_household_email_invite(
  p_invite_token text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
  invite_row private.household_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    raise exception 'Display name is invalid';
  end if;

  current_user_email := private.current_verified_email();
  if current_user_email is null then
    raise exception 'A verified email is required';
  end if;

  select * into invite_row
  from private.household_invites as invite
  where invite.token_hash = extensions.digest(
      upper(btrim(coalesce(p_invite_token, ''))),
      'sha256'
    )
    and invite.invitee_email = current_user_email
    and invite.accepted_at is null
    and invite.expires_at > now()
  for update;

  if not found then
    raise exception 'Invite is invalid, expired, or belongs to another email';
  end if;

  if exists (
    select 1
    from public.household_members as member
    where member.user_id = current_user_id
  ) then
    raise exception 'User already belongs to a household';
  end if;

  if exists (
    select 1
    from public.household_members as member
    where member.household_id = invite_row.household_id
      and member.inputter = invite_row.inputter
  ) then
    raise exception 'That household role is already occupied';
  end if;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    display_name,
    inputter
  ) values (
    invite_row.household_id,
    current_user_id,
    'member',
    btrim(p_display_name),
    invite_row.inputter
  );

  update private.household_invites as invite
  set accepted_at = now(),
      accepted_by = current_user_id
  where invite.id = invite_row.id;

  return invite_row.household_id;
end
$$;

revoke all on function public.create_household_email_invite(text, text)
  from public, anon, authenticated;
revoke all on function public.list_household_email_invites()
  from public, anon, authenticated;
revoke all on function public.cancel_household_email_invite(uuid)
  from public, anon, authenticated;
revoke all on function public.get_household_email_invite(text)
  from public, anon, authenticated;
revoke all on function public.accept_household_email_invite(text, text)
  from public, anon, authenticated;

grant execute on function public.create_household_email_invite(text, text)
  to authenticated;
grant execute on function public.list_household_email_invites()
  to authenticated;
grant execute on function public.cancel_household_email_invite(uuid)
  to authenticated;
grant execute on function public.get_household_email_invite(text)
  to authenticated;
grant execute on function public.accept_household_email_invite(text, text)
  to authenticated;

commit;
