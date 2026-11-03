import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { ROLES } from "@/lib/roles";
const schema=z.object({
  email:z.string().email(),
  fullName:z.string().trim().min(2).max(120),
  role:z.enum(ROLES),
  organizationId:z.string().uuid().nullable().optional()
});
export async function POST(req:Request){
 try{
  const caller=await createServerClient();const {data:{user}}=await caller.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:profile}=await caller.from("profiles").select("role,is_locked").eq("id",user.id).single();
  if(profile?.role!=="ADMIN"||profile.is_locked)return NextResponse.json({error:"Administrator access required"},{status:403});
  let body:unknown;
  try{body=await req.json();}catch{return NextResponse.json({error:"Request body must be valid JSON."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid invitation details"},{status:400});
  if(parsed.data.role==="CLIENT"&&!parsed.data.organizationId)return NextResponse.json({error:"Institutional client accounts must be linked to an organization."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Server invitation service is not configured"},{status:503});
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL;
  if(!siteUrl)return NextResponse.json({error:"The application site URL is not configured on the server."},{status:503});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const redirectTo=new URL("/auth/callback",siteUrl).toString();
  const {data,error}=await admin.auth.admin.inviteUserByEmail(parsed.data.email,{
   data:{full_name:parsed.data.fullName},
   redirectTo
  });
  if(error)throw error;
  const {error:profileError}=await caller.from("profiles").update({
   full_name:parsed.data.fullName,
   role:parsed.data.role,
   organization_id:parsed.data.organizationId??null
  }).eq("id",data.user.id).select("id").single();
  if(profileError)throw profileError;
  return NextResponse.json({success:true,userId:data.user.id});
 }catch(e){console.error("User invitation failed",e);return NextResponse.json({error:"Invitation failed. Check administrator permissions and server configuration."},{status:500});}
}
