import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function DebtorPortal(){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");return <main className="min-h-screen bg-midnight p-8"><h1 className="text-2xl text-gold">Borrower Self-Service Portal</h1><p className="mt-3 text-slate-300">Your verified debt account, payment history and payment-plan requests will appear here.</p><a className="inline-block mt-6 text-gold underline" href="/dashboard">Back to workspace</a></main>}
