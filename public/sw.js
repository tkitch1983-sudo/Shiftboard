const CACHE='neas-shift-board-shell-v24';
const SHELL=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./pins-tab.js'];

async function withPinsTab(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  if(html.includes('pins-tab.js')) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html.replace('</body>','<script src="./pins-tab.js?v=1"></script></body>'),{status:response.status,statusText:response.statusText,headers});
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
        const fresh=await fetch(req);
        const cache=await caches.open(CACHE);
        cache.put('./',fresh.clone());
        return await withPinsTab(fresh);
      }catch(_e){
        const cached=await caches.match('./');
        return cached ? await withPinsTab(cached) : Response.error();
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
