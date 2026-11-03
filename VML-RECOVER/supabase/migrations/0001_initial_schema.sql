-- VML RECOVER initial schema. Apply in Supabase SQL editor.
create extension if not exists pgcrypto;

create type public.app_role as enum ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER','FINANCE','LEGAL','CLIENT','DEBTOR');
create type public.case_status as enum ('ACTIVE','DEMAND_LETTER','FIELD_VISIT','LEGAL_ACTION','SETTLED','CLOSED');
create type public.risk_level as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type public.payment_channel as enum ('BANK_SLIP','MTN_MOBILE_MONEY','AIRTEL_MONEY','RTGS_EFT','CASHIER');
create type public.ptp_status as enum ('PENDING','KEPT','BROKEN');

create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 organization_type text not null default 'CREDITOR',
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 role public.app_role not null default 'DEBTOR',
 organization_id uuid references public.organizations(id),
 is_locked boolean not null default false,
 failed_login_attempts integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.debt_cases (
 id uuid primary key default gen_random_uuid(),
 case_number text unique not null,
 debtor_user_id uuid references public.profiles(id),
 debtor_full_name text not null,
 nin_or_company_reg text,
 loan_account_number text,
 creditor_id uuid references public.organizations(id),
 principal numeric(18,2) not null check(principal>=0),
 accrued_interest numeric(18,2) not null default 0 check(accrued_interest>=0),
 penalties numeric(18,2) not null default 0 check(penalties>=0),
 recovered_amount numeric(18,2) not null default 0 check(recovered_amount>=0),
 outstanding_balance numeric(18,2) generated always as (greatest(principal+accrued_interest+penalties-recovered_amount,0)) stored,
 ageing_days integer not null default 0 check(ageing_days>=0),
 status public.case_status not null default 'ACTIVE',
 risk_level public.risk_level not null default 'MEDIUM',
 assigned_officer uuid references public.profiles(id),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.collateral (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id) on delete cascade,
 collateral_type text not null,
 description text not null,
 reference_number text,
 estimated_value numeric(18,2),
 created_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id),
 amount numeric(18,2) not null check(amount>0),
 payment_date timestamptz not null default now(),
 channel public.payment_channel not null,
 reference_number text unique,
 notes text,
 recorded_by uuid references public.profiles(id),
 verified_by uuid references public.profiles(id),
 verified_at timestamptz,
 receipt_code text not null unique default encode(gen_random_bytes(16),'hex'),
 created_at timestamptz not null default now()
);
create table public.promises_to_pay (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id),
 promised_amount numeric(18,2) not null check(promised_amount>0),
 due_date date not null,
 debtor_contact text,
 status public.ptp_status not null default 'PENDING',
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.field_visits (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id),
 officer_id uuid references public.profiles(id),
 scheduled_at timestamptz,
 visited_at timestamptz,
 outcome text check(outcome in ('DEBTOR_FOUND','REFUSED_TO_PAY','PROMISED_PAYMENT','PREMISES_VACATED')),
 notes text,
 latitude double precision,
 longitude double precision,
 created_at timestamptz not null default now()
);
create table public.legal_matters (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id),
 stage text not null default 'PRE_LEGAL' check(stage in ('PRE_LEGAL','DEMAND_ISSUED','MEDIATION','LITIGATION','EXECUTION','RECOVERY')),
 document_type text,
 document_reference text,
 court_reference text,
 notes text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.case_activities (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.debt_cases(id),
 actor_id uuid references public.profiles(id),
 activity_type text not null,
 description text not null,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references public.profiles(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and is_locked=false $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER','FINANCE','LEGAL'),false) $$;

-- New invited accounts receive a profile from trusted auth metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,full_name,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),
   case when new.raw_user_meta_data->>'role' in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER','FINANCE','LEGAL','CLIENT','DEBTOR')
     then (new.raw_user_meta_data->>'role')::public.app_role else 'DEBTOR'::public.app_role end)
 on conflict(id) do nothing;
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.debt_cases enable row level security;
alter table public.collateral enable row level security;
alter table public.payments enable row level security;
alter table public.promises_to_pay enable row level security;
alter table public.field_visits enable row level security;
alter table public.legal_matters enable row level security;
alter table public.case_activities enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read self or admin" on public.profiles for select to authenticated
using(id=auth.uid() or public.current_app_role()='ADMIN');
create policy "admin manages profiles" on public.profiles for all to authenticated
using(public.current_app_role()='ADMIN') with check(public.current_app_role()='ADMIN');
create policy "staff read organizations" on public.organizations for select to authenticated using(public.is_staff() or id=(select organization_id from public.profiles where id=auth.uid()));
create policy "admin manages organizations" on public.organizations for all to authenticated using(public.current_app_role()='ADMIN') with check(public.current_app_role()='ADMIN');

create policy "staff read cases" on public.debt_cases for select to authenticated
using(public.is_staff() or debtor_user_id=auth.uid() or creditor_id=(select organization_id from public.profiles where id=auth.uid()));
create policy "staff create cases" on public.debt_cases for insert to authenticated with check(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER'));
create policy "manager update cases" on public.debt_cases for update to authenticated
using(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER','LEGAL','FINANCE'))
with check(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','FIELD_OFFICER','LEGAL','FINANCE'));

create policy "authorized collateral read" on public.collateral for select to authenticated
using(exists(select 1 from public.debt_cases c where c.id=case_id and (public.is_staff() or c.debtor_user_id=auth.uid() or c.creditor_id=(select organization_id from public.profiles where id=auth.uid()))));
create policy "staff collateral manage" on public.collateral for all to authenticated using(public.is_staff()) with check(public.is_staff());

create policy "authorized payment read" on public.payments for select to authenticated
using(exists(select 1 from public.debt_cases c where c.id=case_id and (public.is_staff() or c.debtor_user_id=auth.uid() or c.creditor_id=(select organization_id from public.profiles where id=auth.uid()))));
create policy "finance or staff record payments" on public.payments for insert to authenticated with check(public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FINANCE'));
create policy "finance verifies payments" on public.payments for update to authenticated using(public.current_app_role() in ('ADMIN','FINANCE')) with check(public.current_app_role() in ('ADMIN','FINANCE'));

create policy "authorized ptp read" on public.promises_to_pay for select to authenticated
using(exists(select 1 from public.debt_cases c where c.id=case_id and (public.is_staff() or c.debtor_user_id=auth.uid())));
create policy "authorized ptp create" on public.promises_to_pay for insert to authenticated
with check(exists(select 1 from public.debt_cases c where c.id=case_id and (public.is_staff() or c.debtor_user_id=auth.uid())));
create policy "staff updates ptp" on public.promises_to_pay for update to authenticated using(public.is_staff()) with check(public.is_staff());

create policy "authorized visits read" on public.field_visits for select to authenticated using(public.is_staff());
create policy "field staff manage visits" on public.field_visits for all to authenticated using(public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FIELD_OFFICER')) with check(public.current_app_role() in ('ADMIN','COLLECTION_MANAGER','FIELD_OFFICER'));
create policy "legal staff read matters" on public.legal_matters for select to authenticated using(public.current_app_role() in ('ADMIN','DIRECTOR','COLLECTION_MANAGER','LEGAL'));
create policy "legal staff manage matters" on public.legal_matters for all to authenticated using(public.current_app_role() in ('ADMIN','LEGAL')) with check(public.current_app_role() in ('ADMIN','LEGAL'));
create policy "authorized activity read" on public.case_activities for select to authenticated using(public.is_staff());
create policy "staff activity insert" on public.case_activities for insert to authenticated with check(public.is_staff());
create policy "admin audit read" on public.audit_logs for select to authenticated using(public.current_app_role()='ADMIN');
create policy "audit insert" on public.audit_logs for insert to authenticated with check(actor_id=auth.uid() or public.current_app_role()='ADMIN');

-- Payment totals are reflected in the case balance in a single database transaction.
create or replace function public.apply_verified_payment()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if new.verified_at is not null and (tg_op='INSERT' or old.verified_at is null) then
   update public.debt_cases set recovered_amount=recovered_amount+new.amount,
     status=case when principal+accrued_interest+penalties-recovered_amount-new.amount<=0 then 'SETTLED'::public.case_status else status end,
     updated_at=now() where id=new.case_id;
 end if;
 return new;
end; $$;
create trigger on_payment_verified after insert or update of verified_at on public.payments
for each row execute procedure public.apply_verified_payment();
