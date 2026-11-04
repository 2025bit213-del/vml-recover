import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {ROLE_HOME, type AppRole} from "@/lib/roles";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const supabase = await createClient();

  if (code) {
    const {error} = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Email-link verification failed", error);
      return NextResponse.redirect(new URL("/login?error=invite", request.url));
    }
  } else if (tokenHash && ["invite", "magiclink", "email", "signup"].includes(type ?? "")) {
    const {error} = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "magiclink" | "email" | "signup"
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
    .from("profiles").select("role,is_locked").eq("id", user.id).single();
  if (profileError || !profile || profile.is_locked) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=invite", request.url));
  }
  return NextResponse.redirect(new URL(ROLE_HOME[profile.role as AppRole], request.url));
}
