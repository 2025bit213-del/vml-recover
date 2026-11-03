-- One-time, server-only initial admin claim and database-backed rate limiting.

create table if not exists public.admin_bootstrap_attempts (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now()
);
revoke all on public.admin_bootstrap_attempts from public, anon, authenticated;

create or replace function public.consume_admin_bootstrap_attempt(p_attempt_key text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare
  current_count integer;
begin
  if p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate limit key';
  end if;

  insert into public.admin_bootstrap_attempts(attempt_key)
  values(p_attempt_key)
  on conflict(attempt_key) do nothing;

  update public.admin_bootstrap_attempts
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

  delete from public.admin_bootstrap_attempts
  where window_started_at < now() - interval '2 days';

  return current_count <= 8;
end;
$$;
revoke all on function public.consume_admin_bootstrap_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_admin_bootstrap_attempt(text) to service_role;

create or replace function public.bootstrap_first_admin(p_user_id uuid, p_full_name text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('vml-recover-initial-admin'));

  if exists (
    select 1 from public.profiles
    where role='ADMIN' and is_locked=false
  ) then
    raise exception 'Initial administrator setup is already complete';
  end if;

  update public.profiles
  set role='ADMIN',
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
