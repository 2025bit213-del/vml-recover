import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ClientPortal(){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");return <main className="min-h-screen bg-midnight p-8"><h1 className="text-2xl text-gold">Institutional Client Portal</h1><p className="mt-3 text-slate-300">Your organization-specific recovery portfolio will appear here once client portfolio access is configured.</p><a className="inline-block mt-6 text-gold underline" href="/dashboard">Back to workspace</a></main>}
