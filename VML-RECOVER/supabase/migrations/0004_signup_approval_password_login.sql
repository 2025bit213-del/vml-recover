-- Public account requests use passwords without email verification.
-- The first owner is separately invited and verified through Supabase Auth.
-- Requested roles remain non-authoritative until an administrator approves them.

alter table public.profiles
  add column if not exists requested_role public.app_role not null default 'DEBTOR',
  add column if not exists approval_status text not null default 'APPROVED'
    check (approval_status in ('PENDING','APPROVED','REJECTED'));

create table if not exists public.signup_attempts (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now()
);
revoke all on public.signup_attempts from public, anon, authenticated;

create or replace function public.consume_signup_attempt(p_attempt_key text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare
  current_count integer;
begin
  if p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate limit key';
  end if;

  insert into public.signup_attempts(attempt_key)
  values(p_attempt_key)
  on conflict(attempt_key) do nothing;

  update public.signup_attempts
  set attempt_count = case
        when window_started_at < now() - interval '1 hour' then 1
        else attempt_count + 1
      end,
      window_started_at = case
        when window_started_at < now() - interval '1 hour' then now()
        else window_started_at
      end
  where attempt_key=p_attempt_key
  returning attempt_count into current_count;

  delete from public.signup_attempts
  where window_started_at < now() - interval '2 days';

  return current_count <= 8;
end;
$$;
revoke all on function public.consume_signup_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_signup_attempt(text) to service_role;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  requested public.app_role;
begin
  requested := case
    when new.raw_user_meta_data->>'requested_role' in (
      'ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER',
      'FINANCE','LEGAL','CLIENT','DEBTOR'
    ) then (new.raw_user_meta_data->>'requested_role')::public.app_role
    else 'DEBTOR'::public.app_role
  end;

  insert into public.profiles(
    id, full_name, email, role, requested_role, approval_status
  )
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.email,
    'DEBTOR',
    requested,
    'PENDING'
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public
as $$
  select role from public.profiles
  where id=auth.uid()
    and is_locked=false
    and approval_status='APPROVED'
$$;

create or replace function public.validate_case_members()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.assigned_officer is not null and not exists (
    select 1 from public.profiles p
    where p.id=new.assigned_officer
      and p.role='FIELD_OFFICER'
      and p.is_locked=false
      and p.approval_status='APPROVED'
  ) then
    raise exception 'Assigned user must be an approved, active field officer';
  end if;
  if new.debtor_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id=new.debtor_user_id
      and p.role='DEBTOR'
      and p.is_locked=false
      and p.approval_status='APPROVED'
  ) then
    raise exception 'Linked user must be an approved, active debtor';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_locking_assigned_officer()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if (new.role<>'FIELD_OFFICER' or new.is_locked or new.approval_status<>'APPROVED')
    and exists(select 1 from public.debt_cases c where c.assigned_officer=new.id) then
    raise exception 'Unassign the user from all cases before changing their role, approval, or lock status';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_assigned_officer on public.profiles;
create trigger protect_assigned_officer
before update of role, is_locked, approval_status on public.profiles
for each row execute procedure public.prevent_locking_assigned_officer();

create or replace function public.list_assignable_officers()
returns table(id uuid, full_name text)
language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not coalesce(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER'), false) then
    raise exception 'Administrator, director, or collection manager access required';
  end if;
  return query
    select p.id, p.full_name
    from public.profiles p
    where p.role='FIELD_OFFICER'
      and p.is_locked=false
      and p.approval_status='APPROVED'
    order by p.full_name;
end;
$$;

create or replace function public.bootstrap_first_admin(p_user_id uuid, p_full_name text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('vml-recover-initial-admin'));

  if exists (
    select 1 from public.profiles
    where role='ADMIN' and is_locked=false and approval_status='APPROVED'
  ) then
    raise exception 'Initial administrator setup is already complete';
  end if;

  update public.profiles
  set role='ADMIN',
      requested_role='ADMIN',
      approval_status='APPROVED',
      full_name=p_full_name,
      organization_id=null,
      is_locked=false
  where id=p_user_id;

  if not found then
    raise exception 'Administrator profile is not available';
  end if;
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid, text) to service_role;

create index if not exists profiles_approval_status_created_at_idx
  on public.profiles(approval_status, created_at desc);
