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

## Current implementation status
- The application includes invitation/OTP authentication, role-specific navigation, case creation and updates, officer assignment, collateral entry, payment recording and verification, promise tracking, field visit scheduling/outcomes, legal matter records, organizations, user access administration, and an administrator audit view.
- The `0002_workflows_and_controls.sql` migration must be applied after `0001_initial_schema.sql`. Application functionality and its access controls are not active until the deployment uses that migration.
- Payment verification is an internal ledger action. There is no bank/mobile-money integration, debtor payment collection, generated receipt delivery, or automated reconciliation.
- The app does not yet include automated role-matrix/RLS tests, record pagination, backups/restore verification, production SMTP verification, legal document storage, or a full incident-response process.
- Run the end-to-end checklist in `README.md` using separate test accounts and synthetic records. Do not use real borrower data or money until a qualified reviewer has verified the deployed RLS policies and operational requirements.
