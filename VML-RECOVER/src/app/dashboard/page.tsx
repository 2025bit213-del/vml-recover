import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard";
export default async function DashboardPage(){
 const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("full_name,role,organization").eq("id",user.id).single();
 return <Dashboard email={user.email??""} profile={profile}/>
}
