import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url,key,{
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }
  });
  const { data:{ user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith("/dashboard") || path.startsWith("/portal") || path === "/set-password";
  if (!user && (protectedPath || path === "/pending-approval")) {
    const target = request.nextUrl.clone(); target.pathname="/login"; return NextResponse.redirect(target);
  }
  if (user) {
    const {data: profile,error} = await supabase.from("profiles")
      .select("role,approval_status,is_locked").eq("id",user.id).maybeSingle();
    if (error) console.error("Could not load signed-in account status",error);
    if (path === "/set-password") {
      if (!profile || profile.is_locked || profile.approval_status !== "APPROVED") {
        const target=request.nextUrl.clone(); target.pathname="/pending-approval"; return NextResponse.redirect(target);
      }
      return response;
    }
    if (!profile || profile.is_locked || profile.approval_status !== "APPROVED") {
      if (path !== "/pending-approval") {
        const target=request.nextUrl.clone(); target.pathname="/pending-approval"; return NextResponse.redirect(target);
      }
      return response;
    }
    if (path === "/login" || path === "/pending-approval") {
      const target=request.nextUrl.clone();
      target.pathname=ROLE_HOME[profile.role as AppRole];
      return NextResponse.redirect(target);
    }
  }
  return response;
}
export const config = { matcher:["/dashboard/:path*","/portal/:path*","/login","/pending-approval","/set-password"] };
