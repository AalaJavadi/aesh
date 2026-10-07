const CACHE='aesh-portfolio-v38';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith('aesh-portfolio-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin||!u.pathname.includes('/assets/portfolio/'))return;e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(e.request,{ignoreVary:true});if(hit)return hit;const r=await fetch(e.request);if(r&&r.ok)await c.put(e.request,r.clone());return r;})());});
