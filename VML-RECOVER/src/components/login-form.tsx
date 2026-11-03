"use client";

import {useState, type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";

type Mode="signin"|"admin-setup";

export function LoginForm() {
  const [mode,setMode]=useState<Mode>("signin");
  const [email,setEmail]=useState("");
  const [fullName,setFullName]=useState("");
  const [accessCode,setAccessCode]=useState("");
  const [otp,setOtp]=useState("");
  const [step,setStep]=useState<"details"|"otp">("details");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState(false);

  function showMessage(value:string,isError=false) {
    setMessage(value);
    setError(isError);
  }

  async function submitSignIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    showMessage("");
    try {
      const supabase=createClient();
      if(step==="details") {
        const {error}=await supabase.auth.signInWithOtp({
          email:email.trim(),
          options:{shouldCreateUser:false}
        });
        if(error) throw error;
        setStep("otp");
        showMessage("If this email belongs to an active invited account, a verification code has been sent.");
      } else {
        const {error}=await supabase.auth.verifyOtp({email:email.trim(),token:otp,type:"email"});
        if(error) throw error;
        window.location.assign("/dashboard");
      }
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Unable to sign in.",true);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminSetup(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    showMessage("");
    try {
      const response=await fetch("/api/admin/bootstrap",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim(),fullName,accessCode})
      });
      const result=await response.json() as {error?:string;message?:string;invitationSent?:boolean};
      if(!response.ok) throw new Error(result.error||"Administrator setup could not be completed.");

      setAccessCode("");
      if(result.invitationSent) {
        setMode("signin");
        showMessage(result.message||"Check your email for an administrator invitation.");
        return;
      }

      const supabase=createClient();
      const {error}=await supabase.auth.signInWithOtp({
        email:email.trim(),
        options:{shouldCreateUser:false}
      });
      if(error) throw error;
      setMode("signin");
      setStep("otp");
      showMessage("Administrator access is ready. A sign-in code has been sent to your email.");
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Administrator setup could not be completed.",true);
    } finally {
      setBusy(false);
    }
  }

  function resetSignIn() {
    setStep("details");
    setOtp("");
    showMessage("");
  }

  return <div className="w-full max-w-md">
    <div className="lg:hidden mb-12"><p className="text-gold font-bold tracking-widest">VML RECOVER</p><p className="text-xs text-slate-500">DEBT RECOVERY & LEGAL PLATFORM</p></div>
    <p className="text-xs uppercase tracking-[.22em] text-gold">Authorized personnel only</p>
    <h2 className="text-3xl font-semibold mt-3">{mode==="admin-setup"?"Owner administrator setup":"Secure sign in"}</h2>
    <p className="text-slate-400 mt-2 mb-8">{mode==="admin-setup"
      ?"First-time setup is limited to the email address approved by the site owner."
      :"Sign in with the work email invited by your site administrator."}</p>

    {mode==="signin"&&<form onSubmit={submitSignIn} className="space-y-5">
      <label className="block text-sm text-slate-300">Work email
        <input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} disabled={step==="otp"} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold disabled:opacity-60" placeholder="name@institution.org"/>
      </label>
      {step==="otp"&&<label className="block text-sm text-slate-300">6-digit email verification code
        <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,""))} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 tracking-[.5em] outline-none focus:border-gold" placeholder="6-digit code"/>
      </label>}
      {message&&<p role={error?"alert":"status"} className={`text-sm ${error?"text-red-300":"text-amber-300"}`}>{message}</p>}
      <button disabled={busy} className="w-full min-h-12 rounded-lg bg-gold text-midnight font-bold hover:bg-goldlight disabled:opacity-50">{busy?"Please wait…":step==="details"?"Continue with email":"Verify & sign in"}</button>
      {step==="otp"&&<button type="button" onClick={resetSignIn} className="w-full text-sm text-slate-400 hover:text-white">Use a different email</button>}
      {step==="details"&&<button type="button" onClick={()=>{setMode("admin-setup");showMessage("");}} className="w-full text-sm text-gold underline underline-offset-4">First time here? Set up the site owner account</button>}
    </form>}

    {mode==="admin-setup"&&<form onSubmit={submitAdminSetup} className="space-y-5">
      <label className="block text-sm text-slate-300">Owner work email
        <input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold" placeholder="owner@institution.org"/>
      </label>
      <label className="block text-sm text-slate-300">Full name
        <input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={event=>setFullName(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
      </label>
      <label className="block text-sm text-slate-300">One-time setup code
        <input required type="password" autoComplete="one-time-code" minLength={12} maxLength={256} value={accessCode} onChange={event=>setAccessCode(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold" placeholder="Get this code from the site owner"/>
      </label>
      {message&&<p role={error?"alert":"status"} className={`text-sm ${error?"text-red-300":"text-amber-300"}`}>{message}</p>}
      <button disabled={busy} className="w-full min-h-12 rounded-lg bg-gold text-midnight font-bold hover:bg-goldlight disabled:opacity-50">{busy?"Checking…":"Verify and set up admin"}</button>
      <button type="button" onClick={()=>{setMode("signin");showMessage("");}} className="w-full text-sm text-slate-400 hover:text-white">Back to sign in</button>
      <p className="text-xs leading-5 text-slate-500">This setup works once, only for the owner email approved by the site owner. You will still need to verify your email.</p>
    </form>}
    {mode==="signin"&&<p className="mt-8 text-xs text-slate-500 leading-5">New staff accounts must be invited by an administrator. Email verification is required; there is no shared site password.</p>}
  </div>;
}
