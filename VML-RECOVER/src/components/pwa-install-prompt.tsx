 "use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
type InstallEvent = Event & { prompt:()=>Promise<void>; userChoice:Promise<{outcome:"accepted"|"dismissed"}> };
export function PwaInstallPrompt(){
 const [event,setEvent]=useState<InstallEvent|null>(null);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const installed=()=>window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone===true || localStorage.getItem("vml-pwa-installed")==="1";
  if(installed())return;
  const onPrompt=(e:Event)=>{e.preventDefault();if(!installed()){setEvent(e as InstallEvent);setVisible(true);}};
  const onInstalled=()=>{localStorage.setItem("vml-pwa-installed","1");setVisible(false);setEvent(null);};
  window.addEventListener("beforeinstallprompt",onPrompt);
  window.addEventListener("appinstalled",onInstalled);
  return()=>{window.removeEventListener("beforeinstallprompt",onPrompt);window.removeEventListener("appinstalled",onInstalled);};
 },[]);
 async function install(){if(!event)return;await event.prompt();const choice=await event.userChoice;if(choice.outcome==="accepted"){localStorage.setItem("vml-pwa-installed","1");setVisible(false);}setEvent(null);}
 if(!visible||!event)return null;
 return <aside className="fixed bottom-4 right-4 z-50 w-[min(92vw,360px)] rounded-xl border border-gold/50 bg-surface p-4 shadow-2xl">
  <button aria-label="Dismiss install prompt" onClick={()=>setVisible(false)} className="absolute right-3 top-3 text-slate-400"><X size={17}/></button>
  <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-panel text-gold grid place-items-center"><Download/></div><div><p className="font-semibold text-sm">Install VML RECOVER</p><p className="text-xs text-slate-400 mt-1">Add a secure shortcut to this device.</p></div></div>
  <button onClick={install} className="mt-4 w-full rounded-lg bg-gold text-midnight font-semibold py-2.5 text-sm">Install application</button>
 </aside>;
}
