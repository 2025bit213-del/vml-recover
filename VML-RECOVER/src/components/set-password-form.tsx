"use client";

import {useState, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router=useRouter();
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(password!==confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const supabase=createClient();
      const {error}=await supabase.auth.updateUser({password});
      if(error) throw error;
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error?error.message:"Unable to set your password.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-midnight text-slate-100 grid place-items-center p-6">
    <section className="w-full max-w-md rounded-xl border border-line bg-surface p-7">
      <p className="text-xs uppercase tracking-[.22em] text-gold">VML RECOVER</p>
      <h1 className="mt-3 text-2xl font-semibold">Set your password</h1>
      <p className="mt-2 mb-6 text-sm text-slate-400">Choose a password with at least 10 characters. You’ll use it for future sign-ins.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-slate-300">New password
          <input required minLength={10} type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
        </label>
        <label className="block text-sm text-slate-300">Confirm new password
          <input required minLength={10} type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
        </label>
        {message&&<p role="alert" className="text-sm text-red-300">{message}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-gold p-4 font-bold text-midnight disabled:opacity-50">{busy?"Saving…":"Save password"}</button>
      </form>
    </section>
  </main>;
}
