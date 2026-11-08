import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/roles";

const caseStatus = z.enum(["ACTIVE", "DEMAND_LETTER", "FIELD_VISIT", "LEGAL_ACTION", "SETTLED", "CLOSED"]);
const riskLevel = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const paymentChannel = z.enum(["BANK_SLIP", "MTN_MOBILE_MONEY", "AIRTEL_MONEY", "RTGS_EFT", "CASHIER"]);
const visitOutcome = z.enum(["DEBTOR_FOUND", "REFUSED_TO_PAY", "PROMISED_PAYMENT", "PREMISES_VACATED"]);
const legalStage = z.enum(["PRE_LEGAL", "DEMAND_ISSUED", "MEDIATION", "LITIGATION", "EXECUTION", "RECOVERY"]);
const uuid = z.string().uuid();

const operation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_case"),
    caseNumber: z.string().trim().min(2).max(80),
    debtorFullName: z.string().trim().min(2).max(160),
    debtorUserId: uuid.nullable().optional(),
    loanAccountNumber: z.string().trim().max(120).nullable().optional(),
    assignedOfficer: uuid.nullable().optional(),
    creditorId: uuid,
    principal: z.coerce.number().positive().max(1_000_000_000_000),
    accruedInterest: z.coerce.number().min(0).max(1_000_000_000_000),
    penalties: z.coerce.number().min(0).max(1_000_000_000_000),
    ageingDays: z.coerce.number().int().min(0).max(100_000)
  }),
  z.object({
    action: z.literal("change_case"),
    id: uuid,
    status: caseStatus.optional(),
    riskLevel: riskLevel.optional(),
    ageingDays: z.coerce.number().int().min(0).max(100_000).optional(),
    assignedOfficer: uuid.nullable().optional()
  }),
  z.object({
    action: z.literal("assign_officer"),
    id: uuid,
    assignedOfficer: uuid.nullable()
  }),
  z.object({
    action: z.literal("record_payment"),
    caseId: uuid,
    amount: z.coerce.number().positive().max(1_000_000_000_000),
    channel: paymentChannel,
    referenceNumber: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional()
  }),
  z.object({action: z.literal("verify_payment"), id: uuid}),
  z.object({
    action: z.literal("create_promise"),
    caseId: uuid,
    promisedAmount: z.coerce.number().positive().max(1_000_000_000_000),
    dueDate: z.string().date(),
    debtorContact: z.string().trim().max(160).nullable().optional()
  }),
  z.object({
    action: z.literal("update_promise"),
    id: uuid,
    status: z.enum(["PENDING", "KEPT", "BROKEN"])
  }),
  z.object({
    action: z.literal("create_collateral"),
    caseId: uuid,
    collateralType: z.string().trim().min(2).max(100),
    description: z.string().trim().min(2).max(1000),
    referenceNumber: z.string().trim().max(160).nullable().optional(),
    estimatedValue: z.coerce.number().min(0).max(1_000_000_000_000).nullable().optional()
  }),
  z.object({
    action: z.literal("create_visit"),
    caseId: uuid,
    officerId: uuid.nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  }),
  z.object({
    action: z.literal("complete_visit"),
    id: uuid,
    outcome: visitOutcome,
    notes: z.string().trim().max(2000).nullable().optional()
  }),
  z.object({
    action: z.literal("create_legal_matter"),
    caseId: uuid,
    stage: legalStage,
    documentType: z.string().trim().max(100).nullable().optional(),
    documentReference: z.string().trim().max(160).nullable().optional(),
    courtReference: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  }),
  z.object({
    action: z.literal("create_organization"),
    name: z.string().trim().min(2).max(160),
    organizationType: z.string().trim().min(2).max(80)
  }),
  z.object({
    action: z.literal("update_profile"),
    id: uuid,
    role: z.enum(ROLES),
    approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    organizationId: uuid.nullable(),
    isLocked: z.boolean()
  })
]);

type Role = (typeof ROLES)[number];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: "Sign in to continue."}, {status: 401});

  const {data: profile, error: profileError} = await supabase
    .from("profiles").select("role,is_locked,approval_status").eq("id", user.id).single();
  if (profileError || !profile) return NextResponse.json({error: "Your account profile is unavailable."}, {status: 403});
  if (profile.is_locked) return NextResponse.json({error: "Your account is locked. Contact an administrator."}, {status: 403});
  if (profile.approval_status !== "APPROVED") {
    return NextResponse.json({error: "Your account is waiting for administrator approval."}, {status: 403});
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: "Request body must be valid JSON."}, {status: 400});
  }
  const parsed = operation.safeParse(body);
  if (!parsed.success) return NextResponse.json({error: "Some fields are missing or invalid."}, {status: 400});
  if (parsed.data.action === "change_case"
      && parsed.data.status === undefined
      && parsed.data.riskLevel === undefined
      && parsed.data.ageingDays === undefined
      && parsed.data.assignedOfficer === undefined) {
    return NextResponse.json({error: "Provide at least one case field to update."}, {status: 400});
  }

  const role = profile.role as Role;
  const data = parsed.data;
  try {
    let result: unknown;
    switch (data.action) {
      case "create_case": {
        if (!["ADMIN", "DIRECTOR", "COLLECTION_MANAGER"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("debt_cases").insert({
          case_number: data.caseNumber,
          debtor_full_name: data.debtorFullName,
          debtor_user_id: data.debtorUserId || null,
          loan_account_number: data.loanAccountNumber || null,
          assigned_officer: data.assignedOfficer || null,
          creditor_id: data.creditorId,
          principal: data.principal,
          accrued_interest: data.accruedInterest,
          penalties: data.penalties,
          ageing_days: data.ageingDays,
          created_by: user.id
        }).select("id,case_number").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "change_case": {
        if (!["ADMIN", "DIRECTOR", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role)) return denied();
        const changes = {
          ...(data.status !== undefined ? {status: data.status} : {}),
          ...(data.riskLevel !== undefined ? {risk_level: data.riskLevel} : {}),
          ...(data.ageingDays !== undefined ? {ageing_days: data.ageingDays} : {}),
          ...(data.assignedOfficer !== undefined ? {assigned_officer: data.assignedOfficer} : {})
        };
        const {data: row, error} = await supabase.from("debt_cases").update(changes).eq("id", data.id).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "assign_officer": {
        if (!["ADMIN", "DIRECTOR", "COLLECTION_MANAGER"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("debt_cases")
          .update({assigned_officer: data.assignedOfficer}).eq("id", data.id).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "record_payment": {
        if (!["ADMIN", "COLLECTION_MANAGER", "FINANCE"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("payments").insert({
          case_id: data.caseId,
          amount: data.amount,
          channel: data.channel,
          reference_number: data.referenceNumber || null,
          notes: data.notes || null,
          recorded_by: user.id
        }).select("id,receipt_code").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "verify_payment": {
        if (!["ADMIN", "FINANCE"].includes(role)) return denied();
        const {error} = await supabase.rpc("verify_payment", {p_payment_id: data.id});
        if (error) throw error;
        result = {id: data.id};
        break;
      }
      case "create_promise": {
        const {data: row, error} = await supabase.from("promises_to_pay").insert({
          case_id: data.caseId,
          promised_amount: data.promisedAmount,
          due_date: data.dueDate,
          debtor_contact: data.debtorContact || null,
          created_by: user.id
        }).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "update_promise": {
        if (!["ADMIN", "COLLECTION_MANAGER", "FINANCE"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("promises_to_pay")
          .update({status: data.status}).eq("id", data.id).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "create_collateral": {
        if (!["ADMIN", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("collateral").insert({
          case_id: data.caseId,
          collateral_type: data.collateralType,
          description: data.description,
          reference_number: data.referenceNumber || null,
          estimated_value: data.estimatedValue ?? null
        }).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "create_visit": {
        if (!["ADMIN", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("field_visits").insert({
          case_id: data.caseId,
          officer_id: role === "FIELD_OFFICER" ? user.id : data.officerId || null,
          scheduled_at: data.scheduledAt || null,
          notes: data.notes || null
        }).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "complete_visit": {
        if (!["ADMIN", "COLLECTION_MANAGER", "FIELD_OFFICER"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("field_visits").update({
          outcome: data.outcome,
          notes: data.notes || null,
          visited_at: new Date().toISOString()
        }).eq("id", data.id).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "create_legal_matter": {
        if (!["ADMIN", "LEGAL"].includes(role)) return denied();
        const {data: row, error} = await supabase.from("legal_matters").insert({
          case_id: data.caseId,
          stage: data.stage,
          document_type: data.documentType || null,
          document_reference: data.documentReference || null,
          court_reference: data.courtReference || null,
          notes: data.notes || null,
          created_by: user.id
        }).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "create_organization": {
        if (role !== "ADMIN") return denied();
        const {data: row, error} = await supabase.from("organizations").insert({
          name: data.name,
          organization_type: data.organizationType
        }).select("id,name").single();
        if (error) throw error;
        result = row;
        break;
      }
      case "update_profile": {
        if (role !== "ADMIN") return denied();
        if (data.role === "CLIENT" && !data.organizationId) {
          return NextResponse.json({error: "Client accounts must be linked to an organization."}, {status: 400});
        }
        if (data.id === user.id && (data.role !== "ADMIN" || data.isLocked || data.approvalStatus !== "APPROVED")) {
          return NextResponse.json({error: "You cannot remove your own administrator access."}, {status: 400});
        }
        if (data.role !== "ADMIN" || data.isLocked || data.approvalStatus !== "APPROVED") {
          const {count, error: countError} = await supabase.from("profiles")
            .select("id", {count: "exact", head: true})
            .eq("role", "ADMIN").eq("is_locked", false).eq("approval_status", "APPROVED");
          if (countError) throw countError;
          if ((count ?? 0) <= 1) {
            const {data: target, error: targetError} = await supabase.from("profiles")
              .select("role,is_locked,approval_status").eq("id", data.id).single();
            if (targetError) throw targetError;
            if (target.role === "ADMIN" && !target.is_locked && target.approval_status === "APPROVED") {
              return NextResponse.json({error: "At least one active administrator must remain."}, {status: 400});
            }
          }
        }
        const {data: row, error} = await supabase.from("profiles").update({
          role: data.role,
          approval_status: data.approvalStatus,
          organization_id: data.organizationId,
          is_locked: data.isLocked
        }).eq("id", data.id).select("id").single();
        if (error) throw error;
        result = row;
        break;
      }
    }
    return NextResponse.json({success: true, data: result});
  } catch (error) {
    console.error("Workflow operation failed", error);
    return NextResponse.json({
      error: "The operation could not be completed. Check your permissions, database setup, and field values."
    }, {status: 400});
  }
}

function denied() {
  return NextResponse.json({error: "Your account role is not permitted to perform this action."}, {status: 403});
}
