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
    return NextResponse.json({error:"Account requests are temporarily unavailable."},{status:503});
  }

  const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const ip=request.headers.get("x-real-ip")?.trim();
  const rateLimitKeys=[`email:${email}`];
  if(ip) rateLimitKeys.push(`ip:${ip}`);
  for(const key of rateLimitKeys) {
    const attemptKey=createHash("sha256").update(key).digest("hex");
    const {data:rateAllowed,error:rateError}=await admin.rpc("consume_signup_attempt",{p_attempt_key:attemptKey});
    if(rateError) {
      console.error("Signup rate check failed",rateError);
      return NextResponse.json({error:"Account requests are temporarily unavailable."},{status:503});
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
