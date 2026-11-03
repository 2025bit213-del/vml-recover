# VML RECOVER

Institutional debt recovery, loan workout and legal mediation platform.

## Technology
- Next.js 14 App Router, React 18 and TypeScript
- Supabase Auth and PostgreSQL with Row Level Security
- Tailwind CSS and Lucide icons
- Progressive Web App install scaffolding

## 1. Local setup
1. Install Node.js 20 or later.
2. Extract this repository and open its root folder in a terminal.
3. Copy `.env.example` to `.env.local`.
4. `.env.example` contains the URL for project `cwofwgnandykjacgcwvo` and a placeholder for its publishable key. Confirm the URL matches your Supabase Dashboard and replace the placeholder with the project's publishable (formerly anon) key.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` empty unless you configure the server-side invitation endpoint. Get the secret from Supabase Dashboard > Project Settings > API Keys. Never commit it or expose it to browser code.
6. Install dependencies: `npm install`.
7. Run the development server: `npm run dev`.

## 2. Supabase database setup
The Supabase project is already identified in `.env.example`; this code does not create or administer the cloud project automatically.

1. Open the SQL Editor in your Supabase Dashboard.
2. Review and run `supabase/migrations/0001_initial_schema.sql`.
3. Configure Authentication > Providers / Email for email OTP or invitations, and configure a production SMTP provider.
4. Disable public sign-ups. Accounts should be provisioned by an authorized administrator.
5. Create the first administrator using a controlled bootstrap process. Do not expose service credentials in the browser. Verify the first admin's profile and role before inviting other users.
6. Test every RLS policy with separate accounts for each role before loading real data.

The PostgreSQL connection string is not required by the Next.js application at runtime. Do not replace `[YOUR-PASSWORD]` with a real password in this repository. The Supabase client uses the project URL and publishable key; privileged server operations require a server-only secret key.

## 3. Supabase CLI (optional)
Install the Supabase CLI, then run:

```bash
supabase login
supabase init
supabase link --project-ref cwofwgnandykjacgcwvo
supabase db push
```

Review the migration before `db push`. The SQL Editor method is also available. Never commit access tokens or database passwords.

## 4. Verify before deployment

```bash
npm run typecheck
npm run build
```

Fix all errors before deployment. Then run `npm run start` and test login, invitation, protected routes and database access.

## 5. Deploy to Vercel
1. Push this project to a GitHub repository that you own or control.
2. Import that repository into Vercel.
3. Add the variables from `.env.example` in Vercel Project Settings > Environment Variables.
4. Add `SUPABASE_SERVICE_ROLE_KEY` only as a server-side environment variable if the invitation endpoint is enabled. Never prefix it with `NEXT_PUBLIC_`.
5. Deploy to Preview first. Run the smoke tests, then promote to Production.
6. Connect the production branch so future Git pushes trigger deployments.

## Security and readiness
This is an integration foundation, not a production-certified debt collection system. See `docs/MILESTONES.md` for the six milestones and acceptance gates. The operational workflows, complete role-specific workspaces, and security test suite still require implementation and verification. Do not use live borrower data or real payment processing until the relevant gates have passed.
