import { redirect } from "next/navigation";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { Dashboard, type WorkspaceData } from "@/components/dashboard";

const staffRoles: AppRole[] = [
  "ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "FIELD_OFFICER", "FINANCE", "LEGAL"
];

export async function WorkspacePage({audience}: {audience: "staff" | "client" | "debtor"}) {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: profile, error: profileError} = await supabase
    .from("profiles")
    .select("id,full_name,email,role,organization_id,is_locked")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return <main className="min-h-screen bg-midnight p-8 text-slate-100">
      <h1 className="text-xl font-semibold">Account setup is incomplete</h1>
      <p className="mt-3 text-slate-400">Your authenticated account has no usable VML RECOVER profile. Ask an administrator to check the Supabase profile and role.</p>
    </main>;
  }
  const role = profile.role as AppRole;
  const noRows = Promise.resolve({data: [], error: null});
  const isAudienceMatch = audience === "staff"
    ? staffRoles.includes(role)
    : audience === "client" ? role === "CLIENT" : role === "DEBTOR";
  if (!isAudienceMatch) redirect(ROLE_HOME[role]);

  const [cases, payments, promises, collateral, visits, legal, organizations, users, audit, officers] = await Promise.all([
    supabase.from("debt_cases").select("id,case_number,debtor_full_name,loan_account_number,creditor_id,principal,accrued_interest,penalties,recovered_amount,outstanding_balance,ageing_days,status,risk_level,assigned_officer,created_at").order("created_at", {ascending: false}).limit(100),
    supabase.from("payments").select("id,case_id,amount,payment_date,channel,reference_number,verified_at,receipt_code,recorded_by").order("created_at", {ascending: false}).limit(100),
    role !== "CLIENT"
      ? supabase.from("promises_to_pay").select("id,case_id,promised_amount,due_date,debtor_contact,status,created_at").order("created_at", {ascending: false}).limit(100)
      : noRows,
    staffRoles.includes(role)
      ? supabase.from("collateral").select("id,case_id,collateral_type,description,reference_number,estimated_value,created_at").order("created_at", {ascending: false}).limit(100)
      : noRows,
    ["ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role)
      ? supabase.from("field_visits").select("id,case_id,officer_id,scheduled_at,visited_at,outcome,notes,created_at").order("created_at", {ascending: false}).limit(100)
      : noRows,
    ["ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "LEGAL"].includes(role)
      ? supabase.from("legal_matters").select("id,case_id,stage,document_type,document_reference,court_reference,notes,created_at").order("created_at", {ascending: false}).limit(100)
      : noRows,
    role !== "DEBTOR"
      ? supabase.from("organizations").select("id,name,organization_type").order("name").limit(200)
      : noRows,
    role === "ADMIN"
      ? supabase.from("profiles").select("id,full_name,email,role,organization_id,is_locked").order("created_at", {ascending: false}).limit(200)
      : noRows,
    role === "ADMIN"
      ? supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,created_at").order("created_at", {ascending: false}).limit(100)
      : noRows,
    ["ADMIN", "DIRECTOR", "COLLECTION_MANAGER"].includes(role)
      ? supabase.rpc("list_assignable_officers")
      : noRows
  ]);

  const errors = [cases, payments, promises, collateral, visits, legal, organizations, users, audit, officers]
    .flatMap(result => result.error ? [result.error.message] : []);
  const data: WorkspaceData = {
    profile,
    email: user.email ?? "",
    cases: cases.data ?? [],
    payments: payments.data ?? [],
    promises: promises.data ?? [],
    collateral: collateral.data ?? [],
    visits: visits.data ?? [],
    legal: legal.data ?? [],
    organizations: organizations.data ?? [],
    users: users.data ?? [],
    officers: officers.data ?? [],
    audit: audit.data ?? [],
    dataErrors: errors
  };
  return <Dashboard data={data}/>;
}
