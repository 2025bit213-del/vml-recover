 "use client";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function LoginForm(){
 const [email,setEmail]=useState(""); const [otp,setOtp]=useState(""); const [step,setStep]=useState<"email"|"otp">("email");
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");
  try{const supabase=createClient();
   if(step==="email"){const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error)throw error;setStep("otp");setMessage("A verification code has been sent if this account is authorized.");}
   else {const {error}=await supabase.auth.verifyOtp({email,token:otp,type:"email"});if(error)throw error;window.location.assign("/dashboard");}
  }catch(err){setMessage(err instanceof Error?err.message:"Unable to sign in.");}finally{setBusy(false);}
 }
 return <div className="w-full max-w-md"><div className="lg:hidden mb-12"><p className="text-gold font-bold tracking-widest">VML RECOVER</p><p className="text-xs text-slate-500">DEBT RECOVERY & LEGAL PLATFORM</p></div>
 <p className="text-xs uppercase tracking-[.22em] text-gold">Authorized personnel only</p><h2 className="text-3xl font-semibold mt-3">Secure sign in</h2><p className="text-slate-400 mt-2 mb-8">Access is restricted to accounts created by your system administrator.</p>
 <form onSubmit={submit} className="space-y-5">
 <label className="block text-sm text-slate-300">Work email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={step==="otp"} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 outline-none focus:border-gold disabled:opacity-60" placeholder="name@institution.org"/></label>
 {step==="otp"&&<label className="block text-sm text-slate-300">6-digit email verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} className="mt-2 w-full rounded-lg border border-line bg-panel p-4 tracking-[.5em] outline-none focus:border-gold" placeholder="••••••"/></label>}
 {message&&<p role="status" className="text-sm text-amber-300">{message}</p>}
 <button disabled={busy} className="w-full min-h-12 rounded-lg bg-gold text-midnight font-bold hover:bg-goldlight disabled:opacity-50">{busy?"Please wait…":step==="email"?"Continue with email":"Verify & sign in"}</button>
 {step==="otp"&&<button type="button" onClick={()=>{setStep("email");setOtp("");setMessage("");}} className="w-full text-sm text-slate-400 hover:text-white">Use a different email</button>}
 </form><p className="mt-8 text-xs text-slate-500 leading-5">New members must be invited by an administrator. Email verification is required. Public self-registration is disabled.</p></div>
}
