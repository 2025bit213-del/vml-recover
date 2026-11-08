import {createHash} from "node:crypto";
import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {ROLES} from "@/lib/roles";

const signupSchema=z.object({
  email:z.string().trim().email().max(254),
  fullName:z.string().trim().min(2).max(120),
  requestedRole:z.enum(ROLES),
  password:z.string().min(10).max(128)
});

export async function POST(request:NextRequest) {
  let body:unknown;
  try {
    body=await request.json();
  } catch {
    return NextResponse.json({error:"Enter the requested details and try again."},{status:400});
  }

  const parsed=signupSchema.safeParse(body);
  if(!parsed.success) {
    return NextResponse.json({error:"Enter a valid email, name, requested role, and password of at least 10 characters."},{status:400});
  }

  const email=parsed.data.email.toLowerCase();
  const ownerEmails=(process.env.ADMIN_BOOTSTRAP_EMAILS??"")
    .split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(ownerEmails.includes(email)) {
    return NextResponse.json({error:"This email must use the first-time administrator setup."},{status:403});
  }

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey) {
    const missing=[];
    if(!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if(!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json({
      error:`Account requests are not configured. Add ${missing.join(" and ")} in Vercel Environment Variables, then redeploy. Keep the service-role key server-only.`
    },{status:503});
  }

  const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const ip=request.headers.get("x-real-ip")?.trim();
  const rateLimitKeys=[`email:${email}`];
  if(ip) rateLimitKeys.push(`ip:${ip}`);
  for(const key of rateLimitKeys) {
    const attemptKey=createHash("sha256").update(key).digest("hex");
    const {data:rateAllowed,error:rateError}=await admin.rpc("consume_signup_attempt",{p_attempt_key:attemptKey});
    if(rateError) {
      console.error("Signup rate check failed",{
        code:rateError.code,
        message:rateError.message
      });
      if(rateError.code==="42883"||rateError.code==="42P01"||rateError.code==="PGRST202") {
        return NextResponse.json({
          error:"The signup rate-limit database objects are missing. In Supabase SQL Editor, run the updated 0004_signup_approval_password_login.sql migration, then retry."
        },{status:503});
      }
      if(rateError.code==="42501") {
        return NextResponse.json({
          error:"Supabase denied the signup rate-limit check. Rerun the updated 0004_signup_approval_password_login.sql migration to restore its service-role permission."
        },{status:503});
      }
      return NextResponse.json({
        error:"Supabase could not validate this account request. Check the Vercel Function Logs for “Signup rate check failed” and confirm migration 0004 succeeded."
      },{status:503});
    }
    if(!rateAllowed) {
      return NextResponse.json({error:"Too many account requests. Try again later."},{status:429});
    }
  }

  const {data,error}=await admin.auth.admin.createUser({
    email,
    password:parsed.data.password,
    email_confirm:true,
    user_metadata:{
      full_name:parsed.data.fullName,
      requested_role:parsed.data.requestedRole
    }
  });
  if(error||!data.user) {
    if(error) console.error("Account request could not be created",error);
    return NextResponse.json({
      error:"The account request could not be created. The email may already be registered; contact the administrator if you need help."
    },{status:409});
  }

  return NextResponse.json({success:true});
}
