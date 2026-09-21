const CACHE='neas-shift-board-shell-v18';
const SHELL=['./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./camera-fix.js'];

async function injectCameraFix(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  if(html.includes('camera-fix.js')) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const fixed=html.replace('</body>','<script src="./camera-fix.js?v=2"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(fixed,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        cache.put('./',fresh.clone());
        return await injectCameraFix(fresh);
      }catch(_e){
        const cached=await caches.match('./');
        return cached ? await injectCameraFix(cached) : Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached) return cached;
    const fresh=await fetch(req);
    const cache=await caches.open(CACHE);
    cache.put(req,fresh.clone());
    return fresh;
  })());
});
