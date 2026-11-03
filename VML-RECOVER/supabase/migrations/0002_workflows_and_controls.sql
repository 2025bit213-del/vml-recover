-- Operational workflows and privilege boundaries. Apply after 0001_initial_schema.sql.

alter table public.profiles add column if not exists email text;
update public.profiles p
set email=u.email
from auth.users u
where u.id=p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id, full_name, email, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'DEBTOR')
  on conflict(id) do nothing;
  return new;
end;
$$;
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  update public.profiles set email=new.email where id=new.id;
  return new;
end;
$$;
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute procedure public.sync_profile_email();

create or replace function public.validate_case_members()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.assigned_officer is not null and not exists (
    select 1 from public.profiles p
    where p.id=new.assigned_officer and p.role='FIELD_OFFICER' and p.is_locked=false
  ) then
    raise exception 'Assigned user must be an active field officer';
  end if;
  if new.debtor_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id=new.debtor_user_id and p.role='DEBTOR' and p.is_locked=false
  ) then
    raise exception 'Linked user must be an active debtor';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_case_members on public.debt_cases;
create trigger validate_case_members before insert or update of assigned_officer, debtor_user_id on public.debt_cases
for each row execute procedure public.validate_case_members();

create or replace function public.prevent_locking_assigned_officer()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if (new.role<>'FIELD_OFFICER' or new.is_locked)
    and exists(select 1 from public.debt_cases c where c.assigned_officer=new.id) then
    raise exception 'Unassign the user from all cases before changing their role or locking the account';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_assigned_officer on public.profiles;
create trigger protect_assigned_officer before update of role, is_locked on public.profiles
for each row execute procedure public.prevent_locking_assigned_officer();

drop policy if exists "manager update cases" on public.debt_cases;
create policy "authorized staff update cases" on public.debt_cases for update to authenticated
using (
  public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER')
  or (public.current_app_role()='FIELD_OFFICER' and assigned_officer=auth.uid())
)
with check (
  public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER')
  or (public.current_app_role()='FIELD_OFFICER' and assigned_officer=auth.uid())
);

drop policy if exists "staff create cases" on public.debt_cases;
create policy "authorized staff create cases" on public.debt_cases for insert to authenticated
with check (
  public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER')
  and created_by=auth.uid()
);
drop policy if exists "staff read cases" on public.debt_cases;
create policy "authorized users read cases" on public.debt_cases for select to authenticated
using (
  public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FINANCE','LEGAL')
  or (public.current_app_role()='FIELD_OFFICER' and assigned_officer=auth.uid())
  or (public.current_app_role()='DEBTOR' and debtor_user_id=auth.uid())
  or (
    public.current_app_role()='CLIENT'
    and creditor_id=(select organization_id from public.profiles where id=auth.uid())
  )
);

-- A case's recovered amount is changed only by the verified-payment trigger.
revoke update on public.debt_cases from authenticated;
grant update(status, risk_level, ageing_days, assigned_officer) on public.debt_cases to authenticated;

drop policy if exists "staff read organizations" on public.organizations;
create policy "authorized users read organizations" on public.organizations for select to authenticated
using (
  public.is_staff()
  or (
    public.current_app_role()='CLIENT'
    and id=(select organization_id from public.profiles where id=auth.uid())
  )
);

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
    where p.role='FIELD_OFFICER' and p.is_locked=false
    order by p.full_name;
end;
$$;
revoke all on function public.list_assignable_officers() from public, anon;
grant execute on function public.list_assignable_officers() to authenticated;

drop policy if exists "finance or staff record payments" on public.payments;
create policy "authorized staff record payments" on public.payments for insert to authenticated
with check (
  public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FINANCE')
  and recorded_by=auth.uid()
  and verified_at is null
  and verified_by is null
);
drop policy if exists "finance verifies payments" on public.payments;
revoke update on public.payments from authenticated;

drop policy if exists "authorized collateral read" on public.collateral;
create policy "authorized collateral read" on public.collateral for select to authenticated
using (
  exists(select 1 from public.debt_cases c where c.id=case_id)
);
drop policy if exists "staff collateral manage" on public.collateral;
create policy "authorized staff manage collateral" on public.collateral for all to authenticated
using (
  public.current_app_role() in ('ADMIN','COLLECTION_MANAGER')
  or (
    public.current_app_role()='FIELD_OFFICER'
    and exists(select 1 from public.debt_cases c where c.id=case_id and c.assigned_officer=auth.uid())
  )
)
with check (
  public.current_app_role() in ('ADMIN','COLLECTION_MANAGER')
  or (
    public.current_app_role()='FIELD_OFFICER'
    and exists(select 1 from public.debt_cases c where c.id=case_id and c.assigned_officer=auth.uid())
  )
);

drop policy if exists "authorized payment read" on public.payments;
create policy "authorized payment read" on public.payments for select to authenticated
using (exists(select 1 from public.debt_cases c where c.id=case_id));

drop policy if exists "authorized ptp create" on public.promises_to_pay;
drop policy if exists "authorized ptp read" on public.promises_to_pay;
create policy "authorized ptp read" on public.promises_to_pay for select to authenticated
using (
  exists(select 1 from public.debt_cases c where c.id=case_id)
);
create policy "authorized ptp create" on public.promises_to_pay for insert to authenticated
with check (
  created_by=auth.uid()
  and exists (
    select 1 from public.debt_cases c where c.id=case_id
    and (public.is_staff() or c.debtor_user_id=auth.uid())
  )
);
drop policy if exists "staff updates ptp" on public.promises_to_pay;
create policy "authorized ptp updates" on public.promises_to_pay for update to authenticated
using (public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FINANCE'))
with check (public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FINANCE'));

drop policy if exists "field staff manage visits" on public.field_visits;
drop policy if exists "authorized visits read" on public.field_visits;
create policy "authorized visits read" on public.field_visits for select to authenticated
using (
  public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER')
  or (public.current_app_role()='FIELD_OFFICER' and officer_id=auth.uid())
);
create policy "authorized staff manage visits" on public.field_visits for all to authenticated
using (
  public.current_app_role() in ('ADMIN','COLLECTION_MANAGER')
  or (
    public.current_app_role()='FIELD_OFFICER'
    and officer_id=auth.uid()
    and exists(select 1 from public.debt_cases c where c.id=case_id and c.assigned_officer=auth.uid())
  )
)
with check (
  (
    public.current_app_role() in ('ADMIN','COLLECTION_MANAGER')
    and (
      officer_id is null
      or exists(select 1 from public.debt_cases c where c.id=case_id and c.assigned_officer=officer_id)
    )
  )
  or (
    public.current_app_role()='FIELD_OFFICER'
    and officer_id=auth.uid()
    and exists(select 1 from public.debt_cases c where c.id=case_id and c.assigned_officer=auth.uid())
  )
);

drop policy if exists "legal staff manage matters" on public.legal_matters;
create policy "authorized legal staff manage matters" on public.legal_matters for all to authenticated
using (public.current_app_role() in ('ADMIN','LEGAL'))
with check (public.current_app_role() in ('ADMIN','LEGAL'));

drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles for all to authenticated
using (public.current_app_role()='ADMIN')
with check (public.current_app_role()='ADMIN');

drop policy if exists "authorized activity read" on public.case_activities;
create policy "authorized activity read" on public.case_activities for select to authenticated
using (exists(select 1 from public.debt_cases c where c.id=case_id));
drop policy if exists "staff activity insert" on public.case_activities;
create policy "staff activity insert" on public.case_activities for insert to authenticated
with check (public.is_staff() and exists(select 1 from public.debt_cases c where c.id=case_id));

-- Payment verification is atomic, cannot be performed by its recorder, and cannot overpay a case.
create or replace function public.verify_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  payment_row public.payments%rowtype;
  remaining numeric(18,2);
begin
  if auth.uid() is null or not coalesce(public.current_app_role() in ('ADMIN','FINANCE'), false) then
    raise exception 'Administrator or finance access required';
  end if;

  select * into payment_row from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if payment_row.verified_at is not null then raise exception 'Payment is already verified'; end if;
  if payment_row.recorded_by=auth.uid() and public.current_app_role()<>'ADMIN' then
    raise exception 'A finance user cannot verify a payment they recorded';
  end if;

  select outstanding_balance into remaining
  from public.debt_cases where id=payment_row.case_id for update;
  if remaining is null then raise exception 'Case not found'; end if;
  if payment_row.amount>remaining then raise exception 'Payment exceeds the outstanding balance'; end if;

  update public.payments
  set verified_by=auth.uid(), verified_at=now()
  where id=p_payment_id;
end;
$$;
revoke all on function public.verify_payment(uuid) from public, anon;
grant execute on function public.verify_payment(uuid) to authenticated;

-- Audit rows are produced by database triggers and are not directly writable by application users.
create or replace function public.capture_audit_event()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  row_id uuid;
begin
  if tg_op='DELETE' then row_id=old.id; else row_id=new.id; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values(auth.uid(), lower(tg_op), tg_table_name, row_id, '{}'::jsonb);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_debt_cases on public.debt_cases;
create trigger audit_debt_cases after insert or update or delete on public.debt_cases
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_collateral on public.collateral;
create trigger audit_collateral after insert or update or delete on public.collateral
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_promises on public.promises_to_pay;
create trigger audit_promises after insert or update or delete on public.promises_to_pay
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_visits on public.field_visits;
create trigger audit_visits after insert or update or delete on public.field_visits
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_legal_matters on public.legal_matters;
create trigger audit_legal_matters after insert or update or delete on public.legal_matters
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_organizations on public.organizations;
create trigger audit_organizations after insert or update or delete on public.organizations
for each row execute procedure public.capture_audit_event();
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after update on public.profiles
for each row execute procedure public.capture_audit_event();

revoke insert, update, delete on public.audit_logs from authenticated;
