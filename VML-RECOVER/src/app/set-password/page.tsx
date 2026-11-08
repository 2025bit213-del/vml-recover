import {redirect} from "next/navigation";
import {SetPasswordForm} from "@/components/set-password-form";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function SetPasswordPage() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");

  const {data:profile,error}=await supabase.from("profiles")
    .select("approval_status,is_locked").eq("id",user.id).single();
  if(error||!profile) {
    return <main className="min-h-screen bg-midnight text-slate-100 grid place-items-center p-6">
      <p role="alert" className="max-w-md rounded-lg border border-red-500/40 p-5">Your account profile could not be loaded. Contact the site administrator.</p>
    </main>;
  }
  if(profile.is_locked||profile.approval_status==="REJECTED") redirect("/pending-approval");
  if(profile.approval_status==="PENDING") redirect("/pending-approval");
  return <SetPasswordForm/>;
}
