import {createHash, timingSafeEqual} from "node:crypto";
import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPublicSiteUrl} from "@/lib/site-url";

const requestSchema=z.object({
  email:z.string().trim().email().max(254),
  fullName:z.string().trim().min(2).max(120),
  accessCode:z.string().min(12).max(256)
});

function safeEqual(left:string,right:string) {
  const leftHash=createHash("sha256").update(left).digest();
  const rightHash=createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash,rightHash);
}

function logAuthFailure(action:string,error:unknown) {
  if(error&&typeof error==="object"&&"message" in error) {
    const authError=error as {message:unknown;status?:unknown;code?:unknown;name?:unknown};
    console.error(action,{
      name:typeof authError.name==="string"?authError.name:undefined,
      status:typeof authError.status==="number"?authError.status:undefined,
      code:typeof authError.code==="string"?authError.code:undefined,
      message:typeof authError.message==="string"?authError.message:"Unknown Supabase Auth error"
    });
    return;
  }
  console.error(action,error);
}

function invitationErrorMessage(error:unknown) {
  const message=error&&typeof error==="object"&&"message" in error&&typeof error.message==="string"
    ? error.message.toLowerCase()
    : "";
  const status=error&&typeof error==="object"&&"status" in error&&typeof error.status==="number"
    ? error.status
    : undefined;

  if(message.includes("rate limit")||message.includes("too many requests")) {
    return "Supabase is temporarily limiting email sends. Wait for the email cooldown before trying again.";
  }
  if(message.includes("already registered")||message.includes("already been registered")||message.includes("already exists")) {
    return "This email already has a Supabase Auth account. Check Authentication → Users. If it is verified, retry setup. If it is unverified, do not delete it unless you are sure it is only an unused setup attempt.";
  }
  if(status===401||status===403) {
    return "Supabase rejected the setup request. Check that NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel belong to the same Supabase project.";
  }
  if(message.includes("smtp")||message.includes("email")||message.includes("mail")) {
    return "Supabase could not send the owner email. Check Authentication → SMTP Settings and Supabase Auth logs; do not keep retrying while the mail provider is failing.";
  }
  return "Supabase could not create or email the owner account. Check Vercel Function Logs for /api/admin/bootstrap and Supabase Auth logs for the timestamp of this attempt.";
}

export async function POST(request:NextRequest) {
  let body:unknown;
  try {
    body=await request.json();
  } catch {
    return NextResponse.json({error:"Enter the requested details and try again."},{status:400});
  }
  const parsed=requestSchema.safeParse(body);
  if(!parsed.success) return NextResponse.json({error:"Enter a valid work email, full name, and setup code."},{status:400});

  const email=parsed.data.email.toLowerCase();
  const fullName=parsed.data.fullName;
  const allowedEmails=(process.env.ADMIN_BOOTSTRAP_EMAILS??"")
    .split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  const expectedCode=process.env.ADMIN_BOOTSTRAP_CODE;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!expectedCode||allowedEmails.length===0||!supabaseUrl||!serviceKey) {
    return NextResponse.json({error:"First-admin setup is not enabled. Contact the site owner."},{status:503});
  }
  if(!allowedEmails.includes(email)) {
    return NextResponse.json({error:"The setup details could not be verified."},{status:403});
  }

  const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  if(!safeEqual(parsed.data.accessCode,expectedCode)) {
    return NextResponse.json({error:"The setup details could not be verified."},{status:403});
  }

  const ip=request.headers.get("x-real-ip")??"unknown";
  const attemptKey=createHash("sha256").update(`${ip}:${email}`).digest("hex");
  const {data:rateAllowed,error:rateError}=await admin.rpc("consume_admin_bootstrap_attempt",{p_attempt_key:attemptKey});
  if(rateError) {
    console.error("Admin bootstrap rate check failed",rateError);
    return NextResponse.json({error:"First-admin setup is temporarily unavailable."},{status:503});
  }
  if(!rateAllowed) return NextResponse.json({error:"Too many administrator setup attempts. Contact the site owner to reset setup."},{status:429});

  const {count,error:adminCheckError}=await admin.from("profiles")
    .select("id",{count:"exact",head:true}).eq("role","ADMIN").eq("is_locked",false).eq("approval_status","APPROVED");
  if(adminCheckError) {
    console.error("Admin bootstrap status check failed",adminCheckError);
    return NextResponse.json({error:"First-admin setup is temporarily unavailable."},{status:503});
  }
  if((count??0)>0) return NextResponse.json({error:"Initial setup is already complete. Ask an administrator to review your account request."},{status:409});

  const {data:userList,error:userListError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
  if(userListError) {
    logAuthFailure("Admin bootstrap Auth-user lookup failed",userListError);
    return NextResponse.json({
      error:"Could not check the owner account. Verify the Vercel Supabase URL and server-only service-role key, then check Vercel Function Logs."
    },{status:503});
  }
  const existingUser=userList.users.find(user=>user.email?.toLowerCase()===email);
  let profileId=existingUser?.id;

  let invitationSent=false;
  if(!profileId) {
    let callbackUrl:URL;
    try {
      callbackUrl=new URL("/auth/callback",getPublicSiteUrl());
    } catch {
      return NextResponse.json({error:"The deployment's public HTTPS URL is not configured correctly."},{status:503});
    }
    const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{
      data:{full_name:fullName},
      redirectTo:callbackUrl.toString()
    });
    if(error||!data.user) {
      logAuthFailure("Initial administrator invitation failed",error);
      return NextResponse.json({error:invitationErrorMessage(error)},{status:502});
    }
    profileId=data.user.id;
    invitationSent=true;
  } else if(existingUser&&!existingUser.email_confirmed_at) {
    return NextResponse.json({
      error:"This email already has an unverified Supabase Auth account, so a second invitation was not sent. Check Authentication → Users. Only remove that Auth user if you confirm it is an unused owner-setup attempt, then retry."
    },{status:409});
  }

  if(!profileId) {
    console.error("Admin bootstrap did not resolve an Auth user ID");
    return NextResponse.json({error:"Could not resolve the owner account. Check Vercel Function Logs."},{status:503});
  }

  if(!invitationSent) {
    const {data:existingProfile,error:profileError}=await admin.from("profiles")
      .select("id").eq("id",profileId).maybeSingle();
    if(profileError) {
      console.error("Admin bootstrap profile lookup failed",profileError);
      return NextResponse.json({error:"Could not check the owner profile. Confirm migration 0004 succeeded and inspect Vercel Function Logs."},{status:503});
    }
    if(!existingProfile) {
      const {error:createProfileError}=await admin.from("profiles").insert({
        id:profileId,
        full_name:fullName,
        email,
        role:"DEBTOR",
        requested_role:"ADMIN",
        approval_status:"PENDING"
      });
      if(createProfileError) {
        console.error("Admin bootstrap profile recovery failed",createProfileError);
        return NextResponse.json({error:"The verified owner exists but its app profile could not be created. Check Vercel Function Logs before retrying."},{status:503});
      }
    }
  }

  const {error:claimError}=await admin.rpc("bootstrap_first_admin",{
    p_user_id:profileId,
    p_full_name:fullName
  });
  if(claimError) {
    logAuthFailure("Initial administrator claim failed",claimError);
    return NextResponse.json({error:"Administrator setup could not be completed. Contact the site owner."},{status:409});
  }

  return NextResponse.json({
    success:true,
    invitationSent,
    message:invitationSent
      ? "Administrator invitation sent. Open that email and follow its link to activate your account."
      : "Administrator access is ready. Sign in or use the password setup link if needed."
  });
}
