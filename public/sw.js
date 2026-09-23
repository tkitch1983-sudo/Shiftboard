const CACHE='neas-shift-board-shell-v26';
const SHELL=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./pins-tab.js','./bradford-fix.js'];

async function withPinsTab(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  const hasPins=html.includes('<script src="./pins-tab.js');
  const hasBradford=html.includes('<script src="./bradford-fix.js');
  if(hasPins && hasBradford){
    return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  // Inject only at the document's real closing </body>. The app contains
  // printable HTML strings with their own </body> tags, so replacing the
  // first occurrence can alter JavaScript/template output and produce raw
  // ${...} placeholders in modals.
  const closeBody=html.toLowerCase().lastIndexOf('</body>');
  if(closeBody<0) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  let extra='';
  if(!hasPins) extra+='<script src="./pins-tab.js?v=2"></script>';
  if(!hasBradford) extra+='<script src="./bradford-fix.js?v=1"></script>';
  const patched=html.slice(0,closeBody)+extra+html.slice(closeBody);
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(patched,{status:response.status,statusText:response.statusText,headers});
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
        // Always take a fresh app shell for navigations so an old transformed
        // copy cannot keep resurfacing on kiosk/PWA devices.
        const fresh=await fetch(req,{cache:'no-store'});
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
