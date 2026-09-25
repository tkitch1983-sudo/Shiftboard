(function(){
  'use strict';

  const TAB_KEY='weeklychecks';
  const BUCKET='weekly-checks';
  const MAX_FILE_BYTES=20*1024*1024;
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp','csv','xls','xlsx']);
  const NON_WORKSHOP_IDS=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']);
  const evidenceCache=new Map();
  const loadingEvidence=new Set();
  let saving=false;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function sites(){return ((state.config&&state.config.sites)||[]).slice();}
  function siteFor(id){return sites().find(function(s){return String(s.id)===String(id);});}
  function isWorkshop(site){
    if(!site) return false;
    const id=String(site.id||''), name=String(site.name||'').toLowerCase();
    return !NON_WORKSHOP_IDS.has(id) && !/petrol|filling station|floaters|upper management/.test(name) && name!=='great ayton';
  }
  function workshopSites(){return sites().filter(isWorkshop).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});}
  function mondayIso(){
    const d=new Date(), diff=(d.getDay()+6)%7;
    d.setHours(12,0,0,0); d.setDate(d.getDate()-diff);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function fileExt(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
  function cleanName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
  function storagePath(path){return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');}
  function mimeFor(file){
    if(file.type) return file.type;
    const e=fileExt(file.name);
    if(e==='pdf') return 'application/pdf';
    if(e==='jpg'||e==='jpeg') return 'image/jpeg';
    if(e==='png') return 'image/png';
    if(e==='webp') return 'image/webp';
    if(e==='csv') return 'text/csv';
    if(e==='xls') return 'application/vnd.ms-excel';
    if(e==='xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }
  function currentSiteId(){
    if(!state.admin) return '';
    return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
  }

  async function fetchRow(siteId){
    if(!siteId) return null;
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
    const res=await fetch(url,{headers,cache:'no-store'});
    if(!res.ok) throw new Error('Weekly checks '+res.status);
    const rows=await res.json();
    const row=rows[0]||null;
    evidenceCache.set(String(siteId),row);
    return row;
  }

  function evidenceButtons(files,label){
    const arr=Array.isArray(files)?files:[];
    if(!arr.length) return '<span style="color:var(--muted-2);font-size:11px;">No attachment yet</span>';
    return arr.map(function(f,i){
      return '<button type="button" class="btn-sm" data-workshop-evidence-open="'+esc(f.path||'')+'" data-workshop-evidence-name="'+esc(f.name||label+' attachment')+'" style="margin:2px 5px 2px 0;">📎 '+esc(f.name||label+(arr.length>1?' '+(i+1):''))+'</button>';
    }).join('');
  }

  function injectEvidence(root,siteId,row){
    const specs=[
      ['wc-car','car_cleaning_files','Car cleaning'],
      ['wc-site','site_cleaning_files','Site cleaning'],
      ['wc-oxy','oxy_acetylene_files','Oxy/acetylene']
    ];
    specs.forEach(function(spec){
      const check=root.querySelector('#'+spec[0]);
      if(!check) return;
      const label=check.closest('label');
      if(!label || label.parentElement.querySelector('[data-workshop-evidence="'+spec[1]+'"]')) return;
      const div=document.createElement('div');
      div.setAttribute('data-workshop-evidence',spec[1]);
      div.style.cssText='margin:0 0 12px 32px;padding:0 0 12px;border-bottom:1px solid var(--line-soft);';
      div.innerHTML='<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Attachments / photos <span style="color:var(--muted-2);">optional</span></div>'
        +'<input type="file" multiple data-workshop-evidence-input="'+spec[1]+'" accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx" style="max-width:100%;">'
        +'<div style="margin-top:7px;">'+evidenceButtons(row&&row[spec[1]],spec[2])+'</div>';
      label.insertAdjacentElement('afterend',div);
    });
  }

  function patchWeeklyHtml(html){
    if(!state.admin) return html;
    const wrap=document.createElement('div'); wrap.innerHTML=html;
    const main=wrap.querySelector('.admin-main');
    if(!main) return html;

    if(state.admin.role==='site' && !isWorkshop(siteFor(state.admin.scopeSite))){
      const reminder=main.querySelector('[data-weekly-open]');
      if(reminder){const box=reminder.closest('div[style*="border-left:5px"]');if(box) box.remove();}
      if(state.admin.tab===TAB_KEY){
        const top=main.querySelector('.admin-topbar');
        main.innerHTML=(top?top.outerHTML:'')+'<h2>Weekly Checks</h2><div class="card">Weekly Checks are only required for workshop sites.</div>';
      }
      return wrap.innerHTML;
    }

    if(state.admin.tab!==TAB_KEY) return wrap.innerHTML;

    const workshopIds=new Set(workshopSites().map(function(s){return String(s.id);}));
    const select=main.querySelector('#weekly-site-select');
    if(select){
      Array.from(select.options).forEach(function(opt){if(!workshopIds.has(String(opt.value))) opt.remove();});
      if(!workshopIds.has(String(state.admin.weeklySite||'')) && select.options.length){
        state.admin.weeklySite=select.options[0].value;
        select.value=state.admin.weeklySite;
      }
    }
    Array.from(main.querySelectorAll('[data-weekly-site]')).forEach(function(btn){
      if(!workshopIds.has(String(btn.getAttribute('data-weekly-site')||''))){const tr=btn.closest('tr');if(tr) tr.remove();}
    });
    Array.from(main.querySelectorAll('h3')).forEach(function(h){if(h.textContent.trim()==='All-sites weekly status') h.textContent='Workshop weekly status';});
    const statusHeading=Array.from(main.querySelectorAll('h3')).find(function(h){return h.textContent.trim()==='Workshop weekly status';});
    if(statusHeading){
      const card=statusHeading.closest('.card');
      if(card){
        const rows=Array.from(card.querySelectorAll('tbody tr'));
        const done=rows.filter(function(tr){return /Done/i.test(tr.textContent||'');}).length;
        const counters=Array.from(card.querySelectorAll('div')).filter(function(d){return /\d+\s+of\s+\d+\s+completed/i.test(d.textContent||'');});
        if(counters[0]) counters[0].innerHTML='<b>'+done+'</b> of <b>'+rows.length+'</b> workshops completed';
      }
    }
    const sub=main.querySelector('h2 + .head-sub');
    if(sub) sub.textContent='Workshop managers complete these once each week. Car cleaning, site cleaning, stocktake and oxy checks can include supporting attachments.';

    const sid=currentSiteId();
    if(sid && isWorkshop(siteFor(sid))){
      const row=evidenceCache.get(String(sid))||null;
      injectEvidence(main,sid,row);
      if(!evidenceCache.has(String(sid)) && !loadingEvidence.has(String(sid))){
        loadingEvidence.add(String(sid));
        setTimeout(function(){fetchRow(sid).catch(function(){}).finally(function(){loadingEvidence.delete(String(sid));try{render();}catch(_e){}});},0);
      }
    }
    return wrap.innerHTML;
  }

  async function uploadFile(siteId,category,file){
    const ext=fileExt(file.name);
    if(!ALLOWED_EXT.has(ext)) throw new Error('Attachments must be PDF, image, CSV or Excel files.');
    if(file.size>MAX_FILE_BYTES) throw new Error('Each attachment must be 20 MB or smaller.');
    const path=siteId+'/'+mondayIso()+'/'+category+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders(); headers['Content-Type']=mimeFor(file); headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers,body:file});
    if(!res.ok) throw new Error('Attachment upload failed ('+res.status+').');
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,category:category,uploadedAt:new Date().toISOString()};
  }

  async function appendUploads(existing,input,siteId,category){
    const out=Array.isArray(existing)?existing.slice():[];
    const files=input&&input.files?Array.from(input.files):[];
    for(const file of files) out.push(await uploadFile(siteId,category,file));
    return out;
  }

  async function submitWorkshopChecks(){
    if(saving) return;
    const form=document.getElementById('weekly-check-form');
    if(!form) return;
    const siteId=String(form.dataset.siteId||'');
    if(!isWorkshop(siteFor(siteId))){showToast('Weekly checks are only for workshop sites.',true);return;}
    const required=[['wc-timesheet','weekly time sheet'],['wc-car','car cleaning sheet'],['wc-site','site cleaning sheet'],['wc-oxy','oxy/acetylene checks']];
    const missing=required.filter(function(x){const el=document.getElementById(x[0]);return !el||!el.checked;}).map(function(x){return x[1];});
    if(missing.length){showToast('Complete these checks first: '+missing.join(', ')+'.',true);return;}
    saving=true;
    const btn=document.querySelector('[data-weekly-submit]'); if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{
      const existing=await fetchRow(siteId)||{};
      const stockInput=document.getElementById('wc-stock-files');
      const existingStock=Array.isArray(existing.stock_files)?existing.stock_files:[];
      if(!existingStock.length && !(stockInput&&stockInput.files&&stockInput.files.length)) throw new Error('Upload the completed stock take sheet before submitting.');
      const car=await appendUploads(existing.car_cleaning_files,document.querySelector('[data-workshop-evidence-input="car_cleaning_files"]'),siteId,'car-cleaning');
      const site=await appendUploads(existing.site_cleaning_files,document.querySelector('[data-workshop-evidence-input="site_cleaning_files"]'),siteId,'site-cleaning');
      const stock=await appendUploads(existing.stock_files,stockInput,siteId,'stocktake');
      const oxy=await appendUploads(existing.oxy_acetylene_files,document.querySelector('[data-workshop-evidence-input="oxy_acetylene_files"]'),siteId,'oxy');
      const payload={
        site_id:siteId,week_start:mondayIso(),weekly_timesheet_done:true,car_cleaning_done:true,site_cleaning_done:true,stock_take_done:true,oxy_acetylene_done:true,
        flag_status:(document.getElementById('wc-flag')||{}).value||'ok',mot_log_status:(document.getElementById('wc-mot')||{}).value||'up_to_date',
        maintenance_status:String((document.getElementById('wc-maint')||{}).value||'OK').trim()||'OK',
        vehicles_left_status:String((document.getElementById('wc-vehicles')||{}).value||'No vehicles left on site').trim()||'No vehicles left on site',
        alarm_callout_status:String((document.getElementById('wc-alarm')||{}).value||'Not required').trim()||'Not required',
        notes:String((document.getElementById('wc-notes')||{}).value||'').trim(),car_cleaning_files:car,site_cleaning_files:site,stock_files:stock,oxy_acetylene_files:oxy
      };
      const headers=await authHeaders(); headers['Content-Type']='application/json'; headers['Prefer']='resolution=merge-duplicates,return=representation';
      const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?on_conflict=site_id,week_start',{method:'POST',headers,body:JSON.stringify(payload)});
      if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('Save failed ('+res.status+')'));}
      evidenceCache.delete(siteId);
      showToast('Weekly workshop checks submitted.');
      const refresh=document.querySelector('[data-weekly-refresh]');
      if(refresh) setTimeout(function(){refresh.click();},0); else render();
    }catch(err){showToast('Could not save weekly checks — '+(err&&err.message?err.message:'unknown error'),true);}
    finally{saving=false;if(btn){btn.disabled=false;btn.textContent='Submit weekly checks';}}
  }

  async function openEvidence(path,name){
    if(!path) return;
    const headers=await authHeaders(); delete headers['Content-Type'];
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/authenticated/'+BUCKET+'/'+storagePath(path),{headers});
    if(!res.ok){showToast('Could not open attachment ('+res.status+').',true);return;}
    const blob=await res.blob(), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.target='_blank';a.rel='noopener';a.download=name||'weekly-check-attachment';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }

  async function printWorkshopReport(){
    if(!state.admin||state.admin.role!=='super'){showToast('Upper Management access required.',true);return;}
    const wk=mondayIso(), ws=workshopSites();
    try{
      const headers=await authHeaders();
      const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(wk),{headers,cache:'no-store'});
      if(!res.ok) throw new Error('Weekly checks '+res.status);
      const data=await res.json(), bySite=new Map(data.map(function(r){return [String(r.site_id),r];}));
      const done=ws.filter(function(s){return bySite.has(String(s.id));}).length;
      const rows=ws.map(function(s){const r=bySite.get(String(s.id)), count=function(v){return Array.isArray(v)?v.length:0;};return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+(r?'DONE':'NOT DONE')+'</td><td>'+(r&&r.weekly_timesheet_done?'✓':'—')+'</td><td>'+(r&&r.car_cleaning_done?'✓':'—')+' / '+count(r&&r.car_cleaning_files)+'</td><td>'+(r&&r.site_cleaning_done?'✓':'—')+' / '+count(r&&r.site_cleaning_files)+'</td><td>'+(r&&r.stock_take_done?'✓':'—')+' / '+count(r&&r.stock_files)+'</td><td>'+(r&&r.oxy_acetylene_done?'✓':'—')+' / '+count(r&&r.oxy_acetylene_files)+'</td><td>'+esc(r&&r.submitted_by_email||'—')+'</td></tr>';}).join('');
      const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" style="max-width:170px;max-height:55px;">':'';
      const html='<!doctype html><html><head><meta charset="utf-8"><title>Weekly Workshop Checks</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}header{display:flex;justify-content:space-between;border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:12px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:6px;text-align:center}th{background:#eee;font-size:9px}.left{text-align:left}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header><div><h1>Weekly Workshop Checks</h1><div>Week commencing '+esc(wk)+' · '+done+' / '+ws.length+' workshops completed</div></div>'+logo+'</header><table><thead><tr><th>Workshop</th><th>Status</th><th>Timesheet</th><th>Car clean / files</th><th>Site clean / files</th><th>Stocktake / files</th><th>Oxy / files</th><th>Manager</th></tr></thead><tbody>'+rows+'</tbody></table><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>';
      const w=window.open('about:blank','_blank','width=1200,height=850'); if(!w) throw new Error('Allow pop-ups to print the weekly report.'); w.document.open();w.document.write(html);w.document.close();
    }catch(err){showToast(err&&err.message?err.message:'Could not print weekly report.',true);}
  }

  try{
    if(typeof canAccessAdminTab==='function'){
      const oldAccess=canAccessAdminTab;
      canAccessAdminTab=function(key){if(key===TAB_KEY&&state.admin&&state.admin.role==='site'&&!isWorkshop(siteFor(state.admin.scopeSite))) return false;return oldAccess(key);};
    }
    if(typeof renderAdmin==='function'){
      const oldRender=renderAdmin;
      renderAdmin=function(){
        if(state.admin&&state.admin.role==='super'){
          const ids=new Set(workshopSites().map(function(s){return String(s.id);}));
          if(!ids.has(String(state.admin.weeklySite||''))){const first=workshopSites()[0];if(first) state.admin.weeklySite=String(first.id);}
        }
        return patchWeeklyHtml(oldRender());
      };
    }
  }catch(err){console.error('Workshop weekly checks patch failed:',err);}

  window.addEventListener('click',function(e){
    const submit=e.target&&e.target.closest?e.target.closest('[data-weekly-submit]'):null;
    if(submit){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();submitWorkshopChecks();return;}
    const evidence=e.target&&e.target.closest?e.target.closest('[data-workshop-evidence-open]'):null;
    if(evidence){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();openEvidence(evidence.getAttribute('data-workshop-evidence-open'),evidence.getAttribute('data-workshop-evidence-name'));return;}
    const print=e.target&&e.target.closest?e.target.closest('[data-weekly-print-report]'):null;
    if(print){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();printWorkshopReport();}
  },true);
})();
