# VML RECOVER

VML RECOVER is a role-based debt recovery workspace built with Next.js, Supabase Auth, and PostgreSQL Row Level Security (RLS). It provides operational record-keeping; it is not a payment processor, legal advice system, or production certification.

## Workspaces and current functionality

| Role | Workspace access |
|---|---|
| ADMIN | Cases, collateral, payments and verification, promises, visits, legal matters, organizations, user approvals/access, and audit trail |
| DIRECTOR | Portfolio cases, assignments, payment and operations visibility |
| COLLECTION_MANAGER | Cases, assignments, payments, promises, visits, collateral, and legal records |
| FIELD_OFFICER | Assigned cases, collateral on assigned cases, promises, and assigned visits |
| FINANCE | Cases, payment recording and verification, and promises |
| LEGAL | Cases and legal matter records |
| CLIENT | Read-only cases and payments for the linked organization |
| DEBTOR | Own linked cases, payment history, and promises; may request a promise-to-pay |

Operational writes are validated by the server and constrained by database policies. Payment recording does not change a balance; finance/admin verification does so atomically, rejects duplicate references, rejects overpayments, and prevents a finance user from verifying their own payment. An administrator may verify as an override. Operational record changes are written to the administrator-only audit trail.

The current implementation is a usable workflow foundation, not a fully certified debt-collection product. It does not integrate a bank/mobile-money gateway, process a debtor payment, send receipts, upload legal documents, collect GPS, implement automated repayment approvals, or provide an automated RLS test suite. Use synthetic data until policies and workflows have been independently tested.

## Local setup

1. Use Node.js 20 or later.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL`. For local use, the site URL is `http://localhost:3000`.
4. For account requests and first-admin setup, set `SUPABASE_SERVICE_ROLE_KEY` to a Supabase secret/service-role key. Keep it server-side only; never use a `NEXT_PUBLIC_` prefix or commit the value.
5. Install and start:

   ```bash
   npm install
   npm run dev
   ```

## Supabase setup

The database is PostgreSQL (not MySQL). In Supabase **SQL Editor**, run the migrations in order:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_workflows_and_controls.sql`
3. `supabase/migrations/0003_admin_bootstrap.sql`
4. `supabase/migrations/0004_signup_approval_password_login.sql`

The second migration adds workflow permissions, assignment lookup, safer payment verification, audit triggers, and profile email data. The third migration enables rate-limited, one-time owner account setup. The fourth adds rate-limited account requests, administrator approval, and password sign-in. Run each once and in order; check that Supabase SQL Editor reports success for each whole script.

Configure Supabase **Authentication → URL Configuration**:

- Set the Site URL to the deployed app’s origin.
- Add `https://YOUR-DEPLOYMENT-DOMAIN/auth/callback` to the redirect URL allow list.
- Keep Supabase email confirmation enabled. The first owner is created through Supabase's invitation flow and must verify their email.
- Regular user requests are created server-side with email confirmation already marked complete; no verification email is sent. They remain blocked until an administrator reviews and approves them. Do not expose the Supabase service-role key.

## First administrator setup

The login page has a **First-time site owner setup** link. The owner enters their name, approved email, and one-time setup code. If that email does not have an account, Supabase sends an invitation; the owner must verify the email and set a password. An existing account can be claimed only if its email is already verified. The setup endpoint refuses to create another initial admin once one is active.

Never use an admin setup code that has been posted in a chat, committed to Git, or otherwise shared publicly. Generate a new unique secret in a password manager and set it as `ADMIN_BOOTSTRAP_CODE` in Vercel. Set `ADMIN_BOOTSTRAP_EMAILS` to the owner's exact email address (multiple addresses may be comma-separated, but only one initial admin can be claimed). Keep the code out of source control and share it with the owner through a private channel. On Vercel, the owner invitation uses the production domain; add that domain's `/auth/callback` URL to Supabase's allowed redirect URLs. After first-admin setup succeeds, remove both bootstrap variables from Vercel and redeploy.

## Invite and manage users

In the deployed app, people create their own account requests from the login page, choosing a requested role and password. No email is sent. The administrator signs in and opens **Users** in the left navigation:

1. Inspect the requested role, choose the final role and organization, set **Approval** to **Approved**, and save. Choose **Rejected** to deny access. The requested role is never granted automatically.
2. For `CLIENT`, select the organization the client belongs to.
3. Users can sign in with the password they chose only after approval. Their session is kept on the same browser/device unless they sign out or the session expires.

Create organizations under **Organizations** before approving a client. Approve a debtor before creating their case if the case should be linked directly to their login. The owner-admin email is blocked from regular signup so it can only be created/claimed through the email-verifying setup flow.

## Starting over with test data

This removes application records and test accounts but **keeps the schema, migrations, functions, and security policies**. Only run this on the intended test project after confirming you have a backup. First run this in Supabase **SQL Editor**:

```sql
begin;
delete from public.case_activities;
delete from public.legal_matters;
delete from public.field_visits;
delete from public.promises_to_pay;
delete from public.payments;
delete from public.collateral;
delete from public.debt_cases;
update public.profiles set organization_id = null;
delete from public.organizations;
delete from public.audit_logs;
truncate table public.admin_bootstrap_attempts;
truncate table public.signup_attempts;
commit;
```

Then in Supabase **Authentication → Users**, delete the disposable test users. Their profile rows are removed automatically. Do not delete tables or run `DROP SCHEMA`; create a new owner admin through the one-time setup page after the reset.

Vercel environment variables required:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | Exact public Vercel origin used for invite redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret used for controlled account creation and setup |
| `ADMIN_BOOTSTRAP_CODE` | Temporary one-time owner setup secret; remove after setup |
| `ADMIN_BOOTSTRAP_EMAILS` | Owner email address(es) allowed to claim initial admin |

Add these in Vercel Project Settings → Environment Variables for the deployment environments, then redeploy. Never share or commit the service-role key.

Troubleshooting:

- If account signup reports **Account requests are not configured**, add `SUPABASE_SERVICE_ROLE_KEY` to Vercel for the active deployment environment. Keep it server-only (no `NEXT_PUBLIC_` prefix), then redeploy. Removing the temporary bootstrap code/email variables must not remove this key; account-request creation still needs it.
- If account signup reports a missing signup rate-limit object, rerun the updated `supabase/migrations/0004_signup_approval_password_login.sql` in SQL Editor. To check for the function and table first, run `select to_regclass('public.signup_attempts') as signup_attempts_table, to_regprocedure('public.consume_signup_attempt(text)') as signup_rate_limit_function;`; both results should be non-null.
- If signup instead points to Vercel Function Logs, open the active deployment's logs, filter for `Signup rate check failed`, and share only the error code/message—not environment variable values or keys.
- If the owner invitation email opens `localhost`, Vercel must be redeployed with its production domain configured in **Authentication → URL Configuration → Redirect URLs** in Supabase. The app uses Vercel's production domain to generate the owner's link; do not set the Vercel site URL to `http://localhost:3000`.
- If owner setup reports an invitation problem, first check **Vercel → Project → Deployments → latest deployment → Functions/Runtime Logs** for `Initial administrator invitation failed`, then check **Supabase → Logs → Auth** for the same time. The app now distinguishes email rate limits, existing Auth accounts, and mismatched Vercel project credentials. Do not share service-role keys or the one-time setup code.
- If setup says an unverified Auth account already exists, inspect **Supabase → Authentication → Users**. Only delete that user if you confirm it is an unused owner-setup attempt; otherwise share the Vercel/Auth log error with the project administrator.
- If the app says **Too many administrator setup attempts**, wait one hour or have the project owner clear the hashed setup-attempt counters in SQL Editor with `truncate table public.admin_bootstrap_attempts;`.
- If Supabase says **email rate limit exceeded**, stop requesting codes/invitations and wait for Supabase's email-send cooldown, or configure a custom SMTP provider in Supabase Auth. Clearing the app's setup counters does not reset Supabase's email limit.
- Password recovery is a separate email from verification; it still requires working Supabase email delivery if a user forgets their password.

## End-to-end test checklist

Use a staging Supabase project, test mailboxes, and fake borrower/case/payment data.

1. **Admin bootstrap:** On `/login`, choose **First-time site owner setup**, enter the allow-listed owner email, name, and a new private code. Verify the email invitation and set a password. Confirm **Users**, **Organizations**, and **Audit trail** appear. Remove the bootstrap variables from Vercel afterward.
2. **Account request:** Open `/login` in a private browser and create an account request with a test email, password, and requested role. Confirm no verification email is sent and the user cannot open a workspace before approval.
3. **Admin approval:** As ADMIN, open **Users**, select the requested final role and organization, choose **Approved**, and save. Sign in as that user using the saved email and password. Confirm that a rejected or locked user remains blocked.
4. **Password/session:** Sign out, sign in again with email and password, then close and reopen the same browser to check the session persists. Password recovery sends a separate email and can be tested if mail delivery is configured.
5. **Set up roles:** Add a test creditor organization. Approve separate test accounts for DIRECTOR, COLLECTION_MANAGER, FIELD_OFFICER, FINANCE, LEGAL, CLIENT (linked to that organization), and DEBTOR.
6. **Create and assign a case:** As ADMIN or COLLECTION_MANAGER, create a case, link the approved debtor account, and assign the approved field officer. Confirm the debtor and field officer only see their linked/assigned cases.
7. **Collateral and visits:** Add collateral to the case, schedule a field visit, then sign in as the assigned FIELD_OFFICER and record an outcome.
8. **Payment control:** As COLLECTION_MANAGER, record a payment with a unique reference. Confirm the case balance is unchanged. Sign in as FINANCE (a different account) and verify it; confirm the balance decreases exactly once. Try a duplicate reference, overpayment, repeat verification, and verifying your own payment; each must fail without changing the balance.
9. **Promises:** Create a promise as staff, then update it to KEPT or BROKEN. As the linked DEBTOR, create a promise request and confirm unrelated cases are unavailable.
10. **Legal:** As LEGAL, add a legal matter. Confirm the legal role cannot administer users or verify payments.
11. **Client isolation:** As CLIENT, verify only cases belonging to its linked organization are visible, and that write controls are absent.
12. **Admin controls:** Lock a test account and verify workflow writes are rejected. Unlock it, sign out, then open **Audit trail** and check recorded operations.
13. **Deployment:** Check Vercel logs after a fresh deployment and confirm account request, email callback, password sign-in, and session persistence work on the deployed domain.

Do not treat a successful build or a visible dashboard as proof of RLS isolation. Complete the role checks above before using real borrower information or processing real money.

## Validation

```bash
npm run typecheck
npm run build
```
