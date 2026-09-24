const CACHE='neas-shift-board-shell-v31';
const SHELL=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./pins-tab.js','./bradford-fix.js','./clock-fix.js','./hartlepool-order.js','./timesheet-print-fix.js'];

async function withPinsTab(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  const hasPins=html.includes('<script src="./pins-tab.js');
  const hasBradford=html.includes('<script src="./bradford-fix.js');
  const hasClockFix=html.includes('<script src="./clock-fix.js');
  const hasHartlepoolOrder=html.includes('<script src="./hartlepool-order.js');
  const hasTimesheetPrintFix=html.includes('<script src="./timesheet-print-fix.js');
  if(hasPins && hasBradford && hasClockFix && hasHartlepoolOrder && hasTimesheetPrintFix) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const closeBody=html.toLowerCase().lastIndexOf('</body>');
  if(closeBody<0) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  let extra='';
  if(!hasPins) extra+='<script src="./pins-tab.js?v=2"></script>';
  if(!hasBradford) extra+='<script src="./bradford-fix.js?v=2"></script>';
  if(!hasClockFix) extra+='<script src="./clock-fix.js?v=1"></script>';
  if(!hasHartlepoolOrder) extra+='<script src="./hartlepool-order.js?v=2"></script>';
  if(!hasTimesheetPrintFix) extra+='<script src="./timesheet-print-fix.js?v=1"></script>';
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
