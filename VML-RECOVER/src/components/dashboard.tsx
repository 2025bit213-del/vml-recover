"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, BriefcaseBusiness, Building2, FileText, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, ROLES, type AppRole } from "@/lib/roles";

type Row = Record<string, unknown>;
type Profile = {id: string; full_name: string; email: string | null; role: AppRole; organization_id: string | null; is_locked: boolean; approval_status: "PENDING"|"APPROVED"|"REJECTED"};
export type WorkspaceData = {
  profile: Profile;
  email: string;
  cases: Row[];
  payments: Row[];
  promises: Row[];
  collateral: Row[];
  visits: Row[];
  legal: Row[];
  organizations: Row[];
  users: Row[];
  officers: Row[];
  audit: Row[];
  dataErrors: string[];
};
type Section = "Overview" | "Cases" | "Collateral" | "Payments" | "Promises" | "Field visits" | "Legal matters" | "Organizations" | "Users" | "Audit trail";
type NavEntry = {label: Section; icon: typeof LayoutDashboard};

const staffRoles: AppRole[] = ["ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "FIELD_OFFICER", "FINANCE", "LEGAL"];
const sectionsForRole: Record<AppRole, Section[]> = {
  ADMIN: ["Overview", "Cases", "Collateral", "Payments", "Promises", "Field visits", "Legal matters", "Organizations", "Users", "Audit trail"],
  DIRECTOR: ["Overview", "Cases", "Collateral", "Payments", "Promises", "Field visits", "Legal matters"],
  COLLECTION_MANAGER: ["Overview", "Cases", "Collateral", "Payments", "Promises", "Field visits", "Legal matters"],
  FIELD_OFFICER: ["Overview", "Cases", "Collateral", "Promises", "Field visits"],
  FINANCE: ["Overview", "Cases", "Payments", "Promises"],
  LEGAL: ["Overview", "Cases", "Legal matters"],
  CLIENT: ["Overview", "Cases", "Payments"],
  DEBTOR: ["Overview", "Cases", "Payments", "Promises"]
};
const icons: Record<Section, typeof LayoutDashboard> = {
Overview: LayoutDashboard, Cases: BriefcaseBusiness, Collateral: Building2, Payments: Wallet, Promises: Activity,
  "Field visits": Users, "Legal matters": FileText, Organizations: Building2, Users, "Audit trail": ShieldCheck
};
const statusValues = ["ACTIVE", "DEMAND_LETTER", "FIELD_VISIT", "LEGAL_ACTION", "SETTLED", "CLOSED"];
const riskValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const paymentChannels = ["BANK_SLIP", "MTN_MOBILE_MONEY", "AIRTEL_MONEY", "RTGS_EFT", "CASHIER"];
const legalStages = ["PRE_LEGAL", "DEMAND_ISSUED", "MEDIATION", "LITIGATION", "EXECUTION", "RECOVERY"];
const visitOutcomes = ["DEBTOR_FOUND", "REFUSED_TO_PAY", "PROMISED_PAYMENT", "PREMISES_VACATED"];

function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function money(value: unknown) {
  const amount = Number(value ?? 0);
  return `UGX ${amount.toLocaleString("en-UG", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}
function when(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString();
}
function caseNumber(cases: Row[], id: unknown) {
  return text(cases.find(row => row.id === id)?.case_number, "Case unavailable");
}

export function Dashboard({data}: {data: WorkspaceData}) {
  const {profile, email} = data;
  const role = profile.role;
  const router = useRouter();
  const nav: NavEntry[] = sectionsForRole[role].map(label => ({label, icon: icons[label]}));
  const [section, setSection] = useState<Section>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(url: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
      });
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || "The request failed.");
      setMessage("Saved successfully.");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, unknown> = {...values, action};
    if (action === "update_profile") {
      payload.isLocked = values.isLocked === "true";
      if (!values.organizationId) payload.organizationId = null;
    }
    if (action === "create_case") {
      if (!values.debtorUserId) payload.debtorUserId = null;
      if (!values.assignedOfficer) payload.assignedOfficer = null;
    }
    if (action === "assign_officer" && !values.assignedOfficer) payload.assignedOfficer = null;
    if (action === "create_collateral" && !values.estimatedValue) payload.estimatedValue = null;
    if (action === "create_visit") {
      if (values.scheduledAt) payload.scheduledAt = new Date(String(values.scheduledAt)).toISOString();
      else payload.scheduledAt = null;
      if (!values.officerId) payload.officerId = null;
    }
    if (await send("/api/operations", payload) && action !== "update_profile") form.reset();
  }

  async function signOut() {
    const supabase = await createClient();
    const {error} = await supabase.auth.signOut();
    if (error) {
      setMessage(`Sign out failed: ${error.message}`);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const activeCases = data.cases.filter(row => row.status !== "SETTLED" && row.status !== "CLOSED");
  const portfolio = data.cases.reduce((sum, row) => sum + Number(row.outstanding_balance ?? 0), 0);
  const recovered = data.payments.filter(row => row.verified_at).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const pendingPromises = data.promises.filter(row => row.status === "PENDING");
  const canCreateCase = ["ADMIN", "DIRECTOR", "COLLECTION_MANAGER"].includes(role);
  const canRecordPayment = ["ADMIN", "COLLECTION_MANAGER", "FINANCE"].includes(role);
  const canVerifyPayment = ["ADMIN", "FINANCE"].includes(role);
  const canCreateVisit = ["ADMIN", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role);
  const canCreateLegal = ["ADMIN", "LEGAL"].includes(role);
  const canPromise = role !== "CLIENT";
  const roleHome = role === "CLIENT" ? "Institutional client portal" : role === "DEBTOR" ? "Borrower portal" : "Staff workspace";

  return <div className="min-h-screen bg-midnight text-slate-100 md:flex">
    <aside className={`${menuOpen ? "fixed inset-0 z-40" : "hidden"} md:flex md:static md:w-64 md:shrink-0 flex-col bg-surface border-r border-line`}>
      <div className="h-20 px-6 flex items-center justify-between border-b border-line">
        <div><p className="font-bold tracking-[.2em] text-gold">VML RECOVER</p><p className="text-[10px] text-slate-500 tracking-widest">{roleHome.toUpperCase()}</p></div>
        <button aria-label="Close menu" className="md:hidden" onClick={() => setMenuOpen(false)}><X/></button>
      </div>
      <nav className="p-4 space-y-1 flex-1">{nav.map(({label, icon: Icon}) => <button key={label} onClick={() => {setSection(label); setMenuOpen(false); setMessage("");}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${section === label ? "bg-panel text-gold border border-gold/30" : "text-slate-400 hover:bg-panel hover:text-white"}`}><Icon size={18}/>{label}</button>)}</nav>
      <div className="p-4 border-t border-line"><div className="text-sm font-semibold">{profile.full_name || email}</div><div className="text-xs text-gold mt-1">{ROLE_LABELS[role]}</div><button onClick={signOut} className="mt-4 flex gap-2 items-center text-sm text-slate-400 hover:text-white"><LogOut size={16}/> Sign out</button></div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="min-h-20 border-b border-line flex items-center justify-between gap-4 px-5 md:px-8 py-4">
        <div className="flex items-center gap-3"><button aria-label="Open menu" className="md:hidden" onClick={() => setMenuOpen(true)}><Menu/></button><div><p className="text-xs text-slate-500">Workspace / {section}</p><h1 className="font-semibold text-lg">{section}</h1></div></div>
        <div className="hidden sm:block text-xs text-slate-400">{email}</div>
      </header>
      <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-6">
        {!profile.is_locked && data.dataErrors.length > 0 && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
          <p>Some database records could not be loaded. Confirm both Supabase migrations have been applied:</p>
          <ul className="mt-2 list-disc pl-5">{data.dataErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
        </div>}
        {profile.is_locked && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">This account is locked. Contact an administrator.</div>}
        {message && <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm text-amber-200">{message}</p>}
        {section === "Overview" && <Overview data={data} portfolio={portfolio} recovered={recovered} activeCount={activeCases.length} promises={pendingPromises}/>}
        {section === "Cases" && <section className="space-y-5">
          {canCreateCase && <Panel title="Create debt case"><form onSubmit={event => submit(event, "create_case")} className="grid md:grid-cols-2 gap-3">
            <Field label="Case number" name="caseNumber" required/>
            <Field label="Debtor full name" name="debtorFullName" required/>
            <Field label="Loan account number" name="loanAccountNumber"/>
            <Select label="Creditor organization" name="creditorId" required options={data.organizations.map(row => [text(row.id), text(row.name)])}/>
            <Select label="Link approved debtor (optional)" name="debtorUserId" options={[["", "Not linked"], ...data.users.filter(row => row.role === "DEBTOR" && row.approval_status === "APPROVED" && !row.is_locked).map(row => [text(row.id), `${text(row.full_name)} · ${text(row.id).slice(0, 8)}`])]} disabled={role !== "ADMIN"}/>
            <Select label="Assign field officer (optional)" name="assignedOfficer" options={[["", "Unassigned"], ...data.officers.map(row => [text(row.id), text(row.full_name)])]}/>
            <Field label="Principal (UGX)" name="principal" type="number" min="0.01" step="0.01" required/>
            <Field label="Accrued interest (UGX)" name="accruedInterest" type="number" min="0" step="0.01" defaultValue="0" required/>
            <Field label="Penalties (UGX)" name="penalties" type="number" min="0" step="0.01" defaultValue="0" required/>
            <Field label="Ageing days" name="ageingDays" type="number" min="0" step="1" defaultValue="0" required/>
            <Submit busy={busy}>Create case</Submit>
          </form></Panel>}
          {["ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role) && data.cases.length > 0 && <Panel title="Update case status and risk"><form onSubmit={event => submit(event, "change_case")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="id" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Select label="Status" name="status" required options={statusValues.map(value => [value, value.replaceAll("_", " ")])}/>
            <Select label="Risk level" name="riskLevel" required options={riskValues.map(value => [value, value])}/>
            <Field label="Ageing days" name="ageingDays" type="number" min="0" step="1" required/>
            <Submit busy={busy}>Update case</Submit>
          </form></Panel>}
          {["ADMIN", "DIRECTOR", "COLLECTION_MANAGER"].includes(role) && data.cases.length > 0 && <Panel title="Assign field officer"><form onSubmit={event => submit(event, "assign_officer")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="id" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Select label="Officer" name="assignedOfficer" required options={[["", "Unassign"], ...data.officers.map(row => [text(row.id), text(row.full_name)])]}/>
            <Submit busy={busy}>Save assignment</Submit>
          </form></Panel>}
          <Panel title={`Cases visible to your account (${data.cases.length})`}><CaseList cases={data.cases} organizations={data.organizations}/></Panel>
        </section>}
        {section === "Collateral" && <section className="space-y-5">
          {["ADMIN", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role) && <Panel title="Register collateral"><form onSubmit={event => submit(event, "create_collateral")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="caseId" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Field label="Collateral type" name="collateralType" required/>
            <Field label="Reference number" name="referenceNumber"/>
            <Field label="Estimated value (UGX)" name="estimatedValue" type="number" min="0" step="0.01"/>
            <TextArea label="Description" name="description"/>
            <Submit busy={busy}>Save collateral</Submit>
          </form></Panel>}
          <Panel title={`Collateral records (${data.collateral.length})`}><div className="space-y-3">{data.collateral.length === 0 && <Empty/>}{data.collateral.map(row => <Record key={text(row.id)} title={`${caseNumber(data.cases, row.case_id)} · ${text(row.collateral_type)}`} detail={`${text(row.description)} · Ref ${text(row.reference_number)} · Estimated ${money(row.estimated_value)}`}/>)}</div></Panel>
        </section>}
        {section === "Payments" && <section className="space-y-5">
          {canRecordPayment && <Panel title="Record an unverified payment"><form onSubmit={event => submit(event, "record_payment")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="caseId" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Field label="Amount (UGX)" name="amount" type="number" min="0.01" step="0.01" required/>
            <Select label="Payment channel" name="channel" required options={paymentChannels.map(value => [value, value.replaceAll("_", " ")])}/>
            <Field label="Reference number (optional)" name="referenceNumber"/>
            <TextArea label="Notes" name="notes"/>
            <Submit busy={busy}>Record payment for review</Submit>
          </form><p className="mt-3 text-xs text-slate-500">Recording a payment does not reduce a balance. An authorized finance user must verify it.</p></Panel>}
          <Panel title={`Payment records (${data.payments.length})`}><div className="space-y-3">{data.payments.length === 0 && <Empty/>}{data.payments.map(row => <article key={text(row.id)} className="rounded-lg border border-line bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-medium">{caseNumber(data.cases, row.case_id)} · {money(row.amount)}</p><p className="text-xs text-slate-400 mt-1">{text(row.channel)} · {text(row.reference_number, "No reference")} · {when(row.payment_date)}</p><p className="text-xs mt-1 text-slate-500">Receipt {text(row.receipt_code)} · {row.verified_at ? `Verified ${when(row.verified_at)}` : "Pending verification"}</p></div>
            {canVerifyPayment && !row.verified_at && <button disabled={busy} onClick={() => send("/api/operations", {action: "verify_payment", id: row.id})} className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-midnight disabled:opacity-50">Verify payment</button>}
          </article>)}</div></Panel>
        </section>}
        {section === "Promises" && <section className="space-y-5">
          {canPromise && <Panel title={role === "DEBTOR" ? "Request a payment promise" : "Record promise to pay"}><form onSubmit={event => submit(event, "create_promise")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="caseId" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Field label="Promised amount (UGX)" name="promisedAmount" type="number" min="0.01" step="0.01" required/>
            <Field label="Due date" name="dueDate" type="date" required/>
            <Field label="Debtor contact (optional)" name="debtorContact"/>
            <Submit busy={busy}>Save promise</Submit>
          </form></Panel>}
          <Panel title={`Promises to pay (${data.promises.length})`}><div className="space-y-3">{data.promises.length === 0 && <Empty/>}{data.promises.map(row => <article key={text(row.id)} className="rounded-lg border border-line bg-panel p-4">
            <Record title={`${caseNumber(data.cases, row.case_id)} · ${money(row.promised_amount)}`} detail={`Due ${text(row.due_date)} · ${text(row.status)} · ${text(row.debtor_contact, "No contact")}`}/>
            {["ADMIN", "COLLECTION_MANAGER", "FINANCE"].includes(role) && <form onSubmit={event => submit(event, "update_promise")} className="flex items-end gap-3 mt-3">
              <input type="hidden" name="id" value={text(row.id)}/>
              <Select label="Promise status" name="status" required defaultValue={text(row.status)} options={["PENDING", "KEPT", "BROKEN"].map(value => [value, value])}/>
              <Submit busy={busy}>Update promise</Submit>
            </form>}
          </article>)}</div></Panel>
        </section>}
        {section === "Field visits" && <section className="space-y-5">
          {canCreateVisit && <Panel title="Schedule field visit"><form onSubmit={event => submit(event, "create_visit")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="caseId" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Select label="Assign field officer" name="officerId" options={[["", role === "FIELD_OFFICER" ? "Assign to me" : "Unassigned"], ...data.officers.map(row => [text(row.id), text(row.full_name)])]} disabled={role === "FIELD_OFFICER"}/>
            <Field label="Scheduled time" name="scheduledAt" type="datetime-local"/>
            <TextArea label="Visit notes" name="notes"/>
            <Submit busy={busy}>Schedule visit</Submit>
          </form></Panel>}
          <Panel title={`Field visits (${data.visits.length})`}><div className="space-y-3">{data.visits.length === 0 && <Empty/>}{data.visits.map(row => <article key={text(row.id)} className="rounded-lg border border-line bg-panel p-4">
            <Record title={`${caseNumber(data.cases, row.case_id)} · ${text(row.outcome, "Scheduled")}`} detail={`${when(row.scheduled_at)} · ${text(row.notes, "No notes")}`}/>
            {canCreateVisit && !row.outcome && <form onSubmit={event => submit(event, "complete_visit")} className="grid md:grid-cols-2 gap-3 mt-4">
              <input type="hidden" name="id" value={text(row.id)}/>
              <Select label="Outcome" name="outcome" required options={visitOutcomes.map(value => [value, value.replaceAll("_", " ")])}/>
              <TextArea label="Visit notes" name="notes" defaultValue={text(row.notes, "")}/>
              <Submit busy={busy}>Complete visit</Submit>
            </form>}
          </article>)}</div></Panel>
        </section>}
        {section === "Legal matters" && <section className="space-y-5">
          {canCreateLegal && <Panel title="Add legal matter"><form onSubmit={event => submit(event, "create_legal_matter")} className="grid md:grid-cols-2 gap-3">
            <Select label="Case" name="caseId" required options={data.cases.map(row => [text(row.id), `${text(row.case_number)} · ${text(row.debtor_full_name)}`])}/>
            <Select label="Stage" name="stage" required options={legalStages.map(value => [value, value.replaceAll("_", " ")])}/>
            <Field label="Document type" name="documentType"/>
            <Field label="Document reference" name="documentReference"/>
            <Field label="Court reference" name="courtReference"/>
            <TextArea label="Notes" name="notes"/>
            <Submit busy={busy}>Save legal matter</Submit>
          </form></Panel>}
          <Panel title={`Legal matters (${data.legal.length})`}><div className="space-y-3">{data.legal.length === 0 && <Empty/>}{data.legal.map(row => <Record key={text(row.id)} title={`${caseNumber(data.cases, row.case_id)} · ${text(row.stage)}`} detail={`${text(row.document_type)} ${text(row.document_reference)} ${text(row.court_reference)} · ${text(row.notes)} · ${when(row.created_at)}`}/>)}</div></Panel>
        </section>}
        {section === "Organizations" && <section className="space-y-5">
          {role === "ADMIN" && <Panel title="Add creditor or client organization"><form onSubmit={event => submit(event, "create_organization")} className="grid md:grid-cols-2 gap-3">
            <Field label="Organization name" name="name" required/>
            <Select label="Organization type" name="organizationType" options={[["CREDITOR", "Creditor"], ["CLIENT", "Institutional client"], ["PARTNER", "Partner"]]}/>
            <Submit busy={busy}>Add organization</Submit>
          </form></Panel>}
          <Panel title="Organizations"><div className="space-y-3">{data.organizations.length === 0 && <Empty/>}{data.organizations.map(row => <Record key={text(row.id)} title={text(row.name)} detail={text(row.organization_type)}/>)}</div></Panel>
        </section>}
        {section === "Users" && <section className="space-y-5">
          <Panel title={`User approvals and access (${data.users.length})`}>
            <p className="mb-4 text-xs text-slate-400">Users create their own account request with an email and password; no verification email is sent. They cannot sign in to a workspace until you approve them and assign the final role. Their requested role is only a request.</p>
            <div className="space-y-3">{data.users.length === 0 && <Empty/>}{data.users.map(row => <UserAccess key={text(row.id)} profile={row} organizations={data.organizations} busy={busy} onSubmit={submit}/>)}</div>
          </Panel>
        </section>}
        {section === "Audit trail" && <Panel title="Recent security and operations events"><div className="space-y-3">{data.audit.length === 0 && <Empty/>}{data.audit.map(row => <Record key={text(row.id)} title={`${text(row.action).toUpperCase()} · ${text(row.entity_type)} · ${text(row.entity_id)}`} detail={`${when(row.created_at)} · actor ${text(row.actor_id, "system")}`}/>)}</div></Panel>}
      </div>
    </main>
  </div>;
}

function Overview({data, portfolio, recovered, activeCount, promises}: {data: WorkspaceData; portfolio: number; recovered: number; activeCount: number; promises: Row[]}) {
  const cards = [
    ["Outstanding · latest 100 visible cases", money(portfolio)],
    ["Verified · latest 100 visible payments", money(recovered)],
    ["Active · latest 100 visible cases", String(activeCount)],
    ["Pending · latest 100 visible promises", String(promises.length)]
  ];
  return <section className="space-y-6">
    <div><p className="text-gold text-xs tracking-[.2em] uppercase">{ROLE_LABELS[data.profile.role]}</p><h2 className="text-2xl md:text-3xl font-semibold mt-2">Good day, {data.profile.full_name.split(" ")[0] || "there"}.</h2><p className="text-sm text-slate-400 mt-2">Totals cover up to 100 recent records visible to your account, not the full portfolio.</p></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-surface p-5"><p className="text-sm text-slate-400">{label}</p><p className="text-xl font-semibold mt-4 font-mono">{value}</p></div>)}</div>
    <div className="grid xl:grid-cols-2 gap-5">
      <Panel title="Recent cases"><div className="space-y-3">{data.cases.slice(0, 5).map(row => <Record key={text(row.id)} title={`${text(row.case_number)} · ${text(row.debtor_full_name)}`} detail={`${text(row.status)} · ${money(row.outstanding_balance)} outstanding`}/>) }{data.cases.length === 0 && <Empty/>}</div></Panel>
      <Panel title="Recent payment activity"><div className="space-y-3">{data.payments.slice(0, 5).map(row => <Record key={text(row.id)} title={`${caseNumber(data.cases, row.case_id)} · ${money(row.amount)}`} detail={`${row.verified_at ? "Verified" : "Awaiting verification"} · ${when(row.payment_date)}`}/>) }{data.payments.length === 0 && <Empty/>}</div></Panel>
    </div>
  </section>;
}

function CaseList({cases, organizations}: {cases: Row[]; organizations: Row[]}) {
  return <div className="space-y-3">{cases.length === 0 && <Empty/>}{cases.map(row => <article key={text(row.id)} className="rounded-lg border border-line bg-panel p-4">
    <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{text(row.case_number)} · {text(row.debtor_full_name)}</p><p className="text-xs text-slate-400 mt-1">Loan {text(row.loan_account_number)} · {text(organizations.find(org => org.id === row.creditor_id)?.name, "Organization unavailable")}</p></div><div className="text-right"><p className="font-mono">{money(row.outstanding_balance)}</p><p className="text-xs text-slate-400 mt-1">{text(row.status)} · {text(row.risk_level)} risk</p></div></div>
    <p className="mt-3 text-xs text-slate-500">Principal {money(row.principal)} · Interest {money(row.accrued_interest)} · Penalties {money(row.penalties)} · Recovered {money(row.recovered_amount)} · {text(row.ageing_days)} ageing days</p>
  </article>)}</div>;
}

function UserAccess({profile, organizations, busy, onSubmit}: {profile: Row; organizations: Row[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>, action: string) => Promise<void>}) {
  return <form onSubmit={event => onSubmit(event, "update_profile")} className="rounded-lg border border-line bg-panel p-4 grid md:grid-cols-4 gap-3 items-end">
    <input type="hidden" name="id" value={text(profile.id)}/>
    <p className="text-sm"><span className="block font-medium">{text(profile.full_name)}</span><span className="block text-xs text-slate-400">{text(profile.email)}</span><span className="block text-xs text-amber-300">Requested: {ROLE_LABELS[text(profile.requested_role, "DEBTOR") as AppRole] ?? text(profile.requested_role)}</span><span className="text-xs text-slate-500">{text(profile.id).slice(0, 8)} · {text(profile.approval_status, "PENDING")} · {profile.is_locked ? "Locked" : "Active"}</span></p>
    <Select label="Role" name="role" required defaultValue={text(profile.role)} options={ROLES.map(value => [value, ROLE_LABELS[value]])}/>
    <Select label="Organization" name="organizationId" defaultValue={text(profile.organization_id, "")} options={[["", "No organization"], ...organizations.map(row => [text(row.id), text(row.name)])]}/>
    <Select label="Approval" name="approvalStatus" required defaultValue={text(profile.approval_status,"PENDING")} options={[["PENDING","Pending review"],["APPROVED","Approved"],["REJECTED","Rejected"]]}/>
    <div className="flex items-center gap-3"><label className="text-xs text-slate-400 flex items-center gap-2"><input type="hidden" name="isLocked" value="false"/><input name="isLocked" type="checkbox" value="true" defaultChecked={Boolean(profile.is_locked)}/> Locked</label><button disabled={busy} className="rounded-md border border-line px-3 py-2 text-sm hover:border-gold disabled:opacity-50">Save access</button></div>
  </form>;
}

function Panel({title, children}: {title: string; children: ReactNode}) {
  return <section className="rounded-xl border border-line bg-surface p-5"><h2 className="font-semibold mb-4">{title}</h2>{children}</section>;
}
function Record({title, detail}: {title: string; detail: string}) {
  return <article className="rounded-lg border border-line bg-panel p-4"><p className="font-medium">{title}</p><p className="text-xs text-slate-400 mt-1">{detail}</p></article>;
}
function Empty() {
  return <p className="rounded-lg border border-dashed border-line p-4 text-sm text-slate-500">No records are visible here yet.</p>;
}
function Field({label, name, type = "text", required = false, min, step, defaultValue}: {label: string; name: string; type?: string; required?: boolean; min?: string; step?: string; defaultValue?: string}) {
  return <label className="block text-xs text-slate-400">{label}<input name={name} type={type} required={required} min={min} step={step} defaultValue={defaultValue} className="mt-1 w-full rounded-md border border-line bg-panel p-3 text-sm text-white outline-none focus:border-gold"/></label>;
}
function TextArea({label, name, defaultValue}: {label: string; name: string; defaultValue?: string}) {
  return <label className="block text-xs text-slate-400 md:col-span-2">{label}<textarea name={name} rows={2} defaultValue={defaultValue} className="mt-1 w-full rounded-md border border-line bg-panel p-3 text-sm text-white outline-none focus:border-gold"/></label>;
}
function Select({label, name, options, required = false, defaultValue, disabled = false}: {label: string; name: string; options: string[][]; required?: boolean; defaultValue?: string; disabled?: boolean}) {
  return <label className="block text-xs text-slate-400">{label}<select name={name} required={required} defaultValue={defaultValue} disabled={disabled} className="mt-1 w-full rounded-md border border-line bg-panel p-3 text-sm text-white outline-none focus:border-gold disabled:opacity-50">{options.map(([value, name]) => <option key={`${value}-${name}`} value={value}>{name}</option>)}</select></label>;
}
function Submit({busy, children}: {busy: boolean; children: ReactNode}) {
  return <button disabled={busy} className="self-end rounded-md bg-gold px-4 py-3 text-sm font-semibold text-midnight hover:bg-goldlight disabled:opacity-50">{busy ? "Saving…" : children}</button>;
}
