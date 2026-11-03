import { LoginForm } from "@/components/login-form";
export default function LoginPage(){ return <main className="min-h-screen grid lg:grid-cols-2 bg-midnight">
  <section className="hidden lg:flex flex-col justify-between p-14 border-r border-line bg-[radial-gradient(ellipse_at_15%_15%,rgba(212,175,55,.14),transparent_45%)]">
    <div><div className="flex items-center gap-3"><div className="h-12 w-12 rounded-xl border border-gold text-gold grid place-items-center text-2xl font-bold">⚖</div><div><p className="font-bold tracking-[.22em] text-gold">VML RECOVER</p><p className="text-xs text-slate-400 tracking-widest">DEBT RECOVERY & LEGAL PLATFORM</p></div></div></div>
    <div className="max-w-xl"><p className="text-gold uppercase tracking-[.25em] text-xs mb-5">Institutional recovery management</p><h1 className="text-5xl font-semibold leading-tight">Clarity, control and accountability in every recovery.</h1><p className="mt-6 text-slate-400 leading-7">A unified workspace for debt portfolios, collections, finance reconciliation and legal mediation.</p></div>
    <p className="text-xs text-slate-500">Secure institutional access · VML RECOVER</p>
  </section>
  <section className="flex items-center justify-center p-6"><LoginForm /></section>
</main>}
