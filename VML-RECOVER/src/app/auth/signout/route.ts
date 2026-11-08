import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function POST(request:NextRequest) {
  const supabase=await createClient();
  const {error}=await supabase.auth.signOut();
  if(error) {
    console.error("Sign out failed",error);
    return NextResponse.redirect(new URL("/pending-approval?error=signout",request.url),303);
  }
  return NextResponse.redirect(new URL("/login",request.url),303);
}
