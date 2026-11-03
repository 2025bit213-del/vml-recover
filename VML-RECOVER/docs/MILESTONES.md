# VML RECOVER — six delivery milestones

This repository is the integrated application foundation and first implementation increment. The six milestones below define the complete delivery scope and acceptance gates. Do not onboard live debtor records or process real payments until all applicable gates have passed.

## 1. Case and portfolio management
- Debt case records, debtor identity/contact, creditor organization, principal, interest, penalties, balance, ageing, risk, assignment and status.
- Collateral register and chronological case activity.
- Acceptance: authorized staff can create/update cases; other organizations and debtors cannot read unrelated records; balances are database-calculated.

## 2. Payment collection and reconciliation
- Payment capture with channel, reference, amount, timestamp and recorder.
- Separate finance verification; verified payments update the case recovery ledger transactionally.
- Promise-to-pay schedules and receipt references.
- Acceptance: duplicate references rejected; unverified payments never reduce debt; verification is idempotent; overpayments are blocked or explicitly handled under approved policy.

## 3. Approvals and operational controls
- Approval states for payment verification, repayment plans and sensitive case changes.
- Separation of duties between recorder and approver where required.
- Acceptance: unauthorized roles cannot approve; every approval/rejection records actor, timestamp and reason.

## 4. Legal and field operations
- Field visit scheduling, visit outcomes and optional GPS coordinates with consent.
- Legal matter stages, document references, court references and case notes.
- Document templates and controlled generation are to be reviewed by qualified Ugandan legal counsel before use.
- Acceptance: only assigned/authorized operational roles can access the relevant records; location collection is transparent and minimized.

## 5. Eight role workspaces
- ADMIN, DIRECTOR, COLLECTION_MANAGER, FIELD_OFFICER, FINANCE, LEGAL, CLIENT and DEBTOR.
- Server-side role checks and PostgreSQL Row Level Security; navigation visibility is not a security boundary.
- Acceptance: automated role matrix tests prove both allowed and denied access for every protected table and action.

## 6. Security, audit and deployment
- Invitation-only account provisioning, email verification/OTP through Supabase Auth, account lifecycle controls, audit trail, secure secrets, backup and incident procedures.
- PWA installation support; no Android-native application or AI-insights module.
- Acceptance: production build, dependency audit, RLS tests, authentication tests, backup restore test and Vercel deployment smoke test all pass.

## Current release status
- Next.js application shell, Supabase client/server wiring, authentication entry, invitation endpoint, initial schema, RLS baseline, dashboard shell and PWA scaffolding are included.
- The dashboard still contains a presentation shell; the full operational workflows and eight distinct role-specific dashboards are not yet complete in this package.
- Supabase SQL and policies require a project-specific review and execution. This package has not been verified against the live Supabase project.
- A clean production build must be run after dependencies are installed. Do not treat this package as production-certified.
