import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url,key,{
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(cookiesToSet){
        cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }
  });
  const { data:{ user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith("/dashboard") || path.startsWith("/portal"))) {
    const target = request.nextUrl.clone(); target.pathname="/login"; return NextResponse.redirect(target);
  }
  if (user && path === "/login") {
    const target=request.nextUrl.clone(); target.pathname="/dashboard"; return NextResponse.redirect(target);
  }
  return response;
}
export const config = { matcher:["/dashboard/:path*","/portal/:path*","/login"] };
