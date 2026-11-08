import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {ROLE_HOME,type AppRole} from "@/lib/roles";

export const dynamic="force-dynamic";

export default async function PendingApprovalPage() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");

  const {data:profile,error}=await supabase.from("profiles")
    .select("approval_status,role,is_locked").eq("id",user.id).single();
  if(error||!profile) {
    return <Status message="Your account was created, but its profile is not ready yet. Please contact the site administrator." />;
  }
  if(profile.approval_status==="APPROVED"&&!profile.is_locked) {
    redirect(ROLE_HOME[profile.role as AppRole]);
  }
  if(profile.approval_status==="REJECTED"||profile.is_locked) {
    return <Status message="This account is not approved for access. Contact the site administrator if you believe this is a mistake." />;
  }
  return <Status message="Your request is waiting for administrator approval. You can sign in here again after the administrator approves your account." />;
}

function Status({message}:{message:string}) {
  return <main className="min-h-screen bg-midnight text-slate-100 grid place-items-center p-6">
    <section className="w-full max-w-lg rounded-xl border border-line bg-surface p-7">
      <p className="text-xs uppercase tracking-[.22em] text-gold">VML RECOVER</p>
      <h1 className="mt-3 text-2xl font-semibold">Account access</h1>
      <p className="mt-3 text-slate-300">{message}</p>
      <form action="/auth/signout" method="post"><button className="mt-6 text-sm text-gold underline">Sign out</button></form>
    </section>
  </main>;
}
