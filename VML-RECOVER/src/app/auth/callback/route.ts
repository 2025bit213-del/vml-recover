import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {ROLE_HOME, type AppRole} from "@/lib/roles";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextPath = request.nextUrl.searchParams.get("next");
  const supabase = await createClient();

  if (code) {
    const {error} = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Email-link verification failed", error);
      return NextResponse.redirect(new URL("/login?error=invite", request.url));
    }
  } else if (tokenHash && ["invite", "magiclink", "email", "signup", "recovery"].includes(type ?? "")) {
    const {error} = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "magiclink" | "email" | "signup" | "recovery"
    });
    if (error) {
      console.error("Email-link verification failed", error);
      return NextResponse.redirect(new URL("/login?error=invite", request.url));
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=invite", request.url));
  }

  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?error=invite", request.url));
  const {data: profile, error: profileError} = await supabase
    .from("profiles").select("role,is_locked,approval_status").eq("id", user.id).single();
  if (profileError || !profile || profile.is_locked) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=invite", request.url));
  }
  if(profile.approval_status!=="APPROVED") {
    return NextResponse.redirect(new URL("/pending-approval",request.url));
  }
  if(nextPath==="/set-password"||type==="invite"||type==="recovery") {
    return NextResponse.redirect(new URL("/set-password",request.url));
  }
  return NextResponse.redirect(new URL(ROLE_HOME[profile.role as AppRole], request.url));
}
