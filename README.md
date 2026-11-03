# VML RECOVER

Institutional debt recovery, loan workout, and legal mediation web application (PWA).

## Run

```bash
cd Desktop/VML-RECOVER
npm install
npm run dev
```

Open http://localhost:3000

Demo password (until production purge): `Recover@2026`  
Master admin: `admin@vmlrecover.ug`

Email: first-time members must enter a 6-digit OTP. If SMTP is not configured, the code is shown as a staging preview. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env.local` to dispatch real mail.

PWA: the install banner appears only on devices where the app is not already installed (standalone / installed flag).
