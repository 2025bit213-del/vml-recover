import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { ROLES } from "@/lib/roles";
const schema=z.object({email:z.string().email(),fullName:z.string().min(2).max(120),role:z.enum(ROLES)});
export async function POST(req:Request){
 try{
  const caller=createServerClient();const {data:{user}}=await caller.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:profile}=await caller.from("profiles").select("role").eq("id",user.id).single();
  if(profile?.role!=="ADMIN")return NextResponse.json({error:"Administrator access required"},{status:403});
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"Invalid invitation details"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Server invitation service is not configured"},{status:503});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await admin.auth.admin.inviteUserByEmail(parsed.data.email,{data:{full_name:parsed.data.fullName,role:parsed.data.role}});
  if(error)throw error;
  return NextResponse.json({success:true,userId:data.user.id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invitation failed"},{status:500});}
}
