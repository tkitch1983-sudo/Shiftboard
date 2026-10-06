const CACHE='neas-shift-board-shell-v112';
const INJECT=[
  ['config-recovery.js','1'],
  ['pins-tab.js','2'],
  ['bradford-fix.js','2'],
  ['clock-fix.js','1'],
  ['hartlepool-order.js','2'],
  ['timesheet-print-fix.js','2'],
  ['etac-timesheet-restriction.js','1'],
  ['clock-out-options.js','2'],
  ['half-day-hours-fix.js','1'],
  ['kiosk-pin-lock.js','2'],
  ['kiosk-five-tap-unlock.js','2'],
  ['kiosk-admin-lock.js','3'],
  ['kiosk-wake-lock.js','2'],
  ['holiday-cover-exempt.js','1'],
  ['sales-ytd.js','2'],
  ['sales-daily-closed-label.js','1'],
  ['target-daily-autosave.js','1'],
  ['holiday-approval-snapshot.js','1'],
  ['all-print-branding.js','1'],
  ['admin-help-cleanup.js','1'],
  ['manager-pin-reset.js','1'],
  ['weekly-checks.js','2'],
  ['weekly-checks-print.js','1'],
  ['weekly-checks-workshop.js','3'],
  ['weekly-checks-name-dropdowns.js','1'],
  ['weekly-checks-counter-fix.js','1'],
  ['weekly-checks-section-saves.js','1'],
  ['weekly-checks-save-feedback.js','1'],
  ['weekly-checks-autosave-all.js','2'],
  ['monthly-hs.js','7'],
  ['monthly-hs-kiosk-stable.js','2'],
  ['monthly-hs-autosave.js','1'],
  ['mot-qc-register.js','1'],
  ['mot-followup.js','1'],
  ['mot-followup-cleanup.js','1'],
  ['monthly-mot-qc.js','2'],
  ['mot-safety-sync.js','2'],
  ['mot-import-delete.js','1'],
  ['full-report.js','1'],
  ['full-report-period-core.js','7'],
  ['full-report-professional-ui.js','9'],
  ['boardroom-presentation.js','8'],
  ['mot-neil-upload-access.js','1'],
  ['mobile-register-fix.js','1'],
  ['bonus-tracking-fix.js','4'],
  ['bonus-personal-overrides.js','1'],
  ['bonus-prediction-lido.js','1'],
  ['floater-bonus.js','1'],
  ['bonus-excel-export.js','1'],
  ['auto-update.js','1']
];
const SHELL=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png',...INJECT.map(([f])=>'./'+f)];

async function withAppScripts(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  const closeBody=html.toLowerCase().lastIndexOf('</body>');
  if(closeBody<0) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  let extra='';
  for(const [file,version] of INJECT){if(!html.includes('<script src="./'+file))extra+='<script src="./'+file+'?v='+version+'"></script>';}
  if(!extra)return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const patched=html.slice(0,closeBody)+extra+html.slice(closeBody);
  const headers=new Headers(response.headers);headers.delete('content-length');
  return new Response(patched,{status:response.status,statusText:response.statusText,headers:headers});
}
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{try{const fresh=await fetch(req,{cache:'no-store'});const cache=await caches.open(CACHE);cache.put('./',fresh.clone());return await withAppScripts(fresh);}catch(_e){const cached=await caches.match('./');return cached?await withAppScripts(cached):Response.error();}})());return;
  }
  event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;const fresh=await fetch(req);const cache=await caches.open(CACHE);cache.put(req,fresh.clone());return fresh;})());
});