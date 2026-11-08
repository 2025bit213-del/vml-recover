"use client";

import {useState, type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";
import {ROLE_LABELS, ROLES, type AppRole} from "@/lib/roles";

type Mode="signin"|"signup"|"admin-setup";

export function LoginForm() {
  const [mode,setMode]=useState<Mode>("signin");
  const [email,setEmail]=useState("");
  const [fullName,setFullName]=useState("");
  const [requestedRole,setRequestedRole]=useState<AppRole>("DEBTOR");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [accessCode,setAccessCode]=useState("");
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
      const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error) throw new Error("Email or password is incorrect. If this is your first sign-in, use the password setup link below.");
      const {data:profile,error:profileError}=await supabase
        .from("profiles").select("approval_status,is_locked").eq("id",data.user.id).single();
      if(profileError||!profile) {
        await supabase.auth.signOut();
        throw new Error("Your account status could not be checked. Contact the administrator.");
      }
      if(profile.approval_status!=="APPROVED"||profile.is_locked) {
        await supabase.auth.signOut();
        showMessage(profile.approval_status==="REJECTED"||profile.is_locked
          ?"This account is not approved for access. Contact the administrator."
          :"Your account request is waiting for administrator approval. You can sign in after it is approved.");
        return;
      }
      window.location.replace("/dashboard");
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Unable to sign in.",true);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(password!==confirmPassword) {
      showMessage("The passwords do not match.",true);
      return;
    }
    setBusy(true);
    showMessage("");
    try {
      const response=await fetch("/api/auth/signup",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          email:email.trim(),
          fullName:fullName.trim(),
          requestedRole,
          password
        })
      });
      const result=await response.json() as {error?:string};
      if(!response.ok) throw new Error(result.error||"Unable to create the account request.");
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      showMessage("Your account request was created without sending a verification email. An administrator must approve it before you can sign in.");
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Unable to create the account.",true);
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordSetup() {
    if(!email.trim()) {
      showMessage("Enter your email address first.",true);
      return;
    }
    setBusy(true);
    showMessage("");
    try {
      const supabase=createClient();
      const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{
        redirectTo:`${window.location.origin}/auth/callback?next=/set-password`
      });
      if(error) throw error;
      showMessage("If an account exists for this address, a password setup link has been sent.");
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Unable to send the password setup link.",true);
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
      setMode("signin");
      showMessage(result.invitationSent
        ? result.message||"Check your email for an administrator invitation and password setup link."
        : "Administrator access is ready. Use the password setup link below if you have not created a password yet.");
    } catch (submitError) {
      showMessage(submitError instanceof Error?submitError.message:"Administrator setup could not be completed.",true);
    } finally {
      setBusy(false);
    }
  }

  function changeMode(next:Mode) {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setAccessCode("");
    showMessage("");
  }

  return <div className="w-full max-w-md">
    <div className="lg:hidden mb-12"><p className="text-gold font-bold tracking-widest">VML RECOVER</p><p className="text-xs text-slate-500">DEBT RECOVERY & LEGAL PLATFORM</p></div>
    <p className="text-xs uppercase tracking-[.22em] text-gold">Authorized personnel only</p>
    <h2 className="text-3xl font-semibold mt-3">{mode==="admin-setup"?"Owner administrator setup":mode==="signup"?"Request an account":"Sign in"}</h2>
    <p className="text-slate-400 mt-2 mb-8">{mode==="admin-setup"
      ?"First-time setup is limited to the email address approved by the site owner."
      :mode==="signup"
        ?"Create an account request with your password. An administrator must approve your access before you can use the workspace."
        :"Sign in with the email and password you set during registration."}</p>

    {mode==="signin"&&<form onSubmit={submitSignIn} className="space-y-5">
      <label className="block text-sm text-slate-300">Work email
        <input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold" placeholder="name@institution.org"/>
      </label>
      <label className="block text-sm text-slate-300">Password
        <input required type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
      </label>
      {message&&<p role={error?"alert":"status"} className={`text-sm ${error?"text-red-300":"text-amber-300"}`}>{message}</p>}
      <button disabled={busy} className="w-full min-h-12 rounded-lg bg-gold text-midnight font-bold hover:bg-goldlight disabled:opacity-50">{busy?"Please wait…":"Sign in"}</button>
      <button type="button" disabled={busy} onClick={sendPasswordSetup} className="w-full text-sm text-slate-400 underline underline-offset-4 disabled:opacity-50">Forgot or need to set your password?</button>
      <button type="button" onClick={()=>changeMode("signup")} className="w-full text-sm text-gold underline underline-offset-4">Create an account request</button>
      <button type="button" onClick={()=>changeMode("admin-setup")} className="w-full text-sm text-slate-500 underline underline-offset-4">First-time site owner setup</button>
    </form>}

    {mode==="signup"&&<form onSubmit={submitSignUp} className="space-y-5">
      <label className="block text-sm text-slate-300">Full name
        <input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={event=>setFullName(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
      </label>
      <label className="block text-sm text-slate-300">Work email
        <input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold" placeholder="name@institution.org"/>
      </label>
      <label className="block text-sm text-slate-300">Role you are requesting
        <select value={requestedRole} onChange={event=>setRequestedRole(event.target.value as AppRole)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold">
          {ROLES.map(role=><option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-300">Create password
        <input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
      </label>
      <label className="block text-sm text-slate-300">Confirm password
        <input required type="password" minLength={10} autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold"/>
      </label>
      {message&&<p role={error?"alert":"status"} className={`text-sm ${error?"text-red-300":"text-amber-300"}`}>{message}</p>}
      <button disabled={busy} className="w-full min-h-12 rounded-lg bg-gold text-midnight font-bold hover:bg-goldlight disabled:opacity-50">{busy?"Submitting…":"Create account request"}</button>
      <p className="text-xs leading-5 text-slate-500">Your selected role is only a request. You cannot access the app until an administrator approves the account and assigns a role.</p>
      <button type="button" onClick={()=>changeMode("signin")} className="w-full text-sm text-slate-400 underline underline-offset-4">Back to sign in</button>
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
      <button type="button" onClick={()=>changeMode("signin")} className="w-full text-sm text-slate-400 hover:text-white">Back to sign in</button>
    </form>}

    <p className="mt-8 text-xs text-slate-500 leading-5">Only the first site-owner administrator verifies their email. Other users sign up with a password and can sign in after an administrator approves their request. You stay signed in on this device until you sign out or the session expires.</p>
  </div>;
}
