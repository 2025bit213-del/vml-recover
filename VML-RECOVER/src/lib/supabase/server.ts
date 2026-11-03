import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({name,value,...options}); } catch {} },
      remove(name: string, options: CookieOptions) { try { cookieStore.set({name,value:"",...options}); } catch {} }
    }
  });
}
