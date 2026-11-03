# VML RECOVER

VML RECOVER is a role-based debt recovery workspace built with Next.js, Supabase Auth, and PostgreSQL Row Level Security (RLS). It provides operational record-keeping; it is not a payment processor, legal advice system, or production certification.

## Workspaces and current functionality

| Role | Workspace access |
|---|---|
| ADMIN | Cases, collateral, payments and verification, promises, visits, legal matters, organizations, user invitations/access, and audit trail |
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
4. For administrator invitations, set `SUPABASE_SERVICE_ROLE_KEY` to a Supabase secret/service-role key. Keep it server-side only; never use a `NEXT_PUBLIC_` prefix or commit the value.
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

The second migration adds workflow permissions, assignment lookup, safer payment verification, audit triggers, and profile email data. The third migration enables rate-limited, one-time owner account setup. Run each once and in order; check that Supabase SQL Editor reports success for each whole script.

Configure Supabase **Authentication → URL Configuration**:

- Set the Site URL to the deployed app’s origin.
- Add `https://YOUR-DEPLOYMENT-DOMAIN/auth/callback` to the redirect URL allow list.
- Enable email OTP/invitations and configure production SMTP before inviting real users.
- Disable public sign-up; accounts should be invited by an administrator.

## First administrator setup

The login page has a **First time here? Set up the site owner account** link. The owner enters their name, approved email, and one-time setup code. If that email already has an account, the account receives the initial ADMIN role; otherwise Supabase sends an invitation. The owner still verifies email and signs in normally. Once an active administrator exists, the setup endpoint permanently refuses to create another initial admin. Additional administrator accounts are invited from **Dashboard → Users**.

Never use an admin setup code that has been posted in a chat, committed to Git, or otherwise shared publicly. Generate a new unique secret in a password manager and set it as `ADMIN_BOOTSTRAP_CODE` in Vercel. Set `ADMIN_BOOTSTRAP_EMAILS` to the owner's exact email address (multiple addresses may be comma-separated, but only one initial admin can be claimed). Keep the code out of source control and share it with the owner through a private channel. After first-admin setup succeeds, remove both bootstrap variables from Vercel and redeploy. The site's regular invitation and email verification remain enabled.

## Invite and manage users

In the deployed app, an administrator signs in and opens **Users** in the left navigation:

1. Invite a user with name, email, and one of the eight roles.
2. For `CLIENT`, select the organization the client belongs to.
3. The user follows the email invitation link; it verifies through `/auth/callback`.
4. After verification, the app sends them to the workspace for their role.
5. Use **Users → User access** to change a role, link an organization, or lock/unlock an account.

Create organizations under **Organizations** before inviting a client. Invite a debtor before creating their case if the case should be linked directly to their login.

Vercel environment variables required:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | Exact public Vercel origin used for invite redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret used by administrator invitations |
| `ADMIN_BOOTSTRAP_CODE` | Temporary one-time owner setup secret; remove after setup |
| `ADMIN_BOOTSTRAP_EMAILS` | Owner email address(es) allowed to claim initial admin |

Add these in Vercel Project Settings → Environment Variables for the deployment environments, then redeploy. Never share or commit the service-role key.

## End-to-end test checklist

Use a staging Supabase project, test mailboxes, and fake borrower/case/payment data.

1. **Authentication:** Open `/login`; request an OTP for an invited user; verify the code. `/` redirects to login. A signed-out request to `/dashboard` redirects to login.
2. **Admin bootstrap:** On `/login`, choose **First time here? Set up the site owner account**, enter the allow-listed owner email, name, and newly generated code. Follow the Supabase invitation if sent, or enter the email OTP. Confirm **Users**, **Organizations**, and **Audit trail** appear. Remove the bootstrap variables from Vercel afterward.
3. **Set up roles:** Add a test creditor organization. Invite separate test accounts for DIRECTOR, COLLECTION_MANAGER, FIELD_OFFICER, FINANCE, LEGAL, CLIENT (linked to that organization), and DEBTOR.
4. **Create and assign a case:** As ADMIN or COLLECTION_MANAGER, create a case, link the debtor account, and assign the field officer. Confirm the debtor and field officer only see their linked/assigned cases.
5. **Collateral and visits:** Add collateral to the case, schedule a field visit, then sign in as the assigned FIELD_OFFICER and record an outcome.
6. **Payment control:** As COLLECTION_MANAGER, record a payment with a unique reference. Confirm the case balance is unchanged. Sign in as FINANCE (a different account) and verify it; confirm the balance decreases exactly once. Try a duplicate reference, overpayment, repeat verification, and verifying your own payment; each must fail without changing the balance.
7. **Promises:** Create a promise as staff, then update it to KEPT or BROKEN. As the linked DEBTOR, create a promise request and confirm unrelated cases are unavailable.
8. **Legal:** As LEGAL, add a legal matter. Confirm the legal role cannot administer users or verify payments.
9. **Client isolation:** As CLIENT, verify only cases belonging to its linked organization are visible, and that write controls are absent.
10. **Admin controls:** Lock a test account and verify workflow writes are rejected. Unlock it, sign out, then open **Audit trail** and check recorded operations.
11. **Deployment:** Check Vercel logs after a fresh deployment and confirm `/login`, invitation callback, and OTP sign-in work on the deployed domain.

Do not treat a successful build or a visible dashboard as proof of RLS isolation. Complete the role checks above before using real borrower information or processing real money.

## Validation

```bash
npm run typecheck
npm run build
```
