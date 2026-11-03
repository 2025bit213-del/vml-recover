const CACHE="vml-recover-shell-v1";
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(["/login","/manifest.webmanifest"])));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
