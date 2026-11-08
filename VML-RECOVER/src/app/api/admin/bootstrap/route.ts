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

  let profileId:string|undefined;
  const {data:existingProfile,error:lookupError}=await admin.from("profiles")
    .select("id").eq("email",email).maybeSingle();
  if(lookupError) {
    console.error("Admin bootstrap profile lookup failed",lookupError);
    return NextResponse.json({error:"Could not check this account. Confirm the latest database migrations are applied."},{status:503});
  }
  profileId=existingProfile?.id;

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
      console.error("Initial administrator invitation failed",error);
      return NextResponse.json({error:"Could not send the setup invitation. Check Supabase email configuration and try again."},{status:502});
    }
    profileId=data.user.id;
    invitationSent=true;
  } else {
    const {data:{user:existingUser},error:userError}=await admin.auth.admin.getUserById(profileId);
    if(userError||!existingUser?.email_confirmed_at) {
      return NextResponse.json({error:"The owner account must verify its email before it can become the administrator. Remove the unverified account from Supabase Auth and retry setup."},{status:409});
    }
  }

  const {error:claimError}=await admin.rpc("bootstrap_first_admin",{
    p_user_id:profileId,
    p_full_name:fullName
  });
  if(claimError) {
    console.error("Initial administrator claim failed",claimError);
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
