const CACHE='neas-shift-board-shell-v48';
const SHELL=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./pins-tab.js','./bradford-fix.js','./hartlepool-order.js','./timesheet-print-fix.js','./clock-out-options.js','./sales-ytd.js','./holiday-approval-snapshot.js','./all-print-branding.js','./manager-pin-reset.js','./weekly-checks.js','./weekly-checks-print.js','./weekly-checks-workshop.js','./weekly-checks-name-dropdowns.js','./weekly-checks-counter-fix.js','./monthly-hs.js','./monthly-mot-qc.js','./public/monthly-mot-qc.js','./config-recovery.js'];

async function withPinsTab(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  const hasPins=html.includes('<script src="./pins-tab.js');
  const hasBradford=html.includes('<script src="./bradford-fix.js');
  const hasHartlepoolOrder=html.includes('<script src="./hartlepool-order.js');
  const hasTimesheetPrintFix=html.includes('<script src="./timesheet-print-fix.js');
  const hasClockOutOptions=html.includes('<script src="./clock-out-options.js');
  const hasSalesYtd=html.includes('<script src="./sales-ytd.js');
  const hasHolidayApprovalSnapshot=html.includes('<script src="./holiday-approval-snapshot.js');
  const hasAllPrintBranding=html.includes('<script src="./all-print-branding.js');
  const hasManagerPinReset=html.includes('<script src="./manager-pin-reset.js');
  const hasWeeklyChecks=html.includes('<script src="./weekly-checks.js');
  const hasWeeklyChecksPrint=html.includes('<script src="./weekly-checks-print.js');
  const hasWeeklyChecksWorkshop=html.includes('<script src="./weekly-checks-workshop.js');
  const hasWeeklyNames=html.includes('<script src="./weekly-checks-name-dropdowns.js');
  const hasWeeklyChecksCounterFix=html.includes('<script src="./weekly-checks-counter-fix.js');
  const hasMonthlyHs=html.includes('<script src="./monthly-hs.js');
  const hasMonthlyMotQc=html.includes('<script src="./monthly-mot-qc.js');
  const hasConfigRecovery=html.includes('<script src="./config-recovery.js');
  if(hasPins && hasBradford && hasHartlepoolOrder && hasTimesheetPrintFix && hasClockOutOptions && hasSalesYtd && hasHolidayApprovalSnapshot && hasAllPrintBranding && hasManagerPinReset && hasWeeklyChecks && hasWeeklyChecksPrint && hasWeeklyChecksWorkshop && hasWeeklyNames && hasWeeklyChecksCounterFix && hasMonthlyHs && hasMonthlyMotQc && hasConfigRecovery) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const closeBody=html.toLowerCase().lastIndexOf('</body>');
  if(closeBody<0) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  let extra='';
  if(!hasConfigRecovery) extra+='<script src="./config-recovery.js?v=1"></script>';
  if(!hasPins) extra+='<script src="./pins-tab.js?v=2"></script>';
  if(!hasBradford) extra+='<script src="./bradford-fix.js?v=2"></script>';
  if(!hasHartlepoolOrder) extra+='<script src="./hartlepool-order.js?v=2"></script>';
  if(!hasTimesheetPrintFix) extra+='<script src="./timesheet-print-fix.js?v=2"></script>';
  if(!hasClockOutOptions) extra+='<script src="./clock-out-options.js?v=2"></script>';
  if(!hasSalesYtd) extra+='<script src="./sales-ytd.js?v=2"></script>';
  if(!hasHolidayApprovalSnapshot) extra+='<script src="./holiday-approval-snapshot.js?v=1"></script>';
  if(!hasAllPrintBranding) extra+='<script src="./all-print-branding.js?v=1"></script>';
  if(!hasManagerPinReset) extra+='<script src="./manager-pin-reset.js?v=1"></script>';
  if(!hasWeeklyChecks) extra+='<script src="./weekly-checks.js?v=1"></script>';
  if(!hasWeeklyChecksPrint) extra+='<script src="./weekly-checks-print.js?v=1"></script>';
  if(!hasWeeklyChecksWorkshop) extra+='<script src="./weekly-checks-workshop.js?v=3"></script>';
  if(!hasWeeklyNames) extra+='<script src="./weekly-checks-name-dropdowns.js?v=1"></script>';
  if(!hasWeeklyChecksCounterFix) extra+='<script src="./weekly-checks-counter-fix.js?v=1"></script>';
  if(!hasMonthlyHs) extra+='<script src="./monthly-hs.js?v=1"></script>';
  if(!hasMonthlyMotQc) extra+='<script src="./monthly-mot-qc.js?v=1"></script>';
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
