(function(){
  'use strict';

  const TAB_KEY='weeklychecks';

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function isoLocal(d){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function mondayFor(d){
    const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    x.setDate(x.getDate()-((x.getDay()+6)%7));
    return x;
  }
  function currentWeekStart(){ return isoLocal(mondayFor(new Date())); }
  function fmtDate(v){
    if(!v) return '—';
    const d=new Date(String(v).length===10?v+'T12:00:00':v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  }
  function fmtDateTime(v){
    if(!v) return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function sites(){
    return ((state.config&&state.config.sites)||[]).slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
  }
  function tick(v){ return v?'✓':'—'; }
  function issueText(r){
    if(!r) return 'Weekly checks not submitted.';
    const out=[];
    if(r.flag_status==='issue') out.push('Flag condition: ISSUE');
    if(r.mot_log_status==='issue') out.push('MOT test log: ISSUE');
    const maint=String(r.maintenance_status||'').trim();
    if(maint && maint.toLowerCase()!=='ok') out.push('Maintenance: '+maint);
    const vehicles=String(r.vehicles_left_status||'').trim();
    if(vehicles && vehicles.toLowerCase()!=='no vehicles left on site') out.push('Vehicles: '+vehicles);
    const alarm=String(r.alarm_callout_status||'').trim();
    if(alarm && alarm.toLowerCase()!=='not required') out.push('Alarm: '+alarm);
    const notes=String(r.notes||'').trim();
    if(notes) out.push('Notes: '+notes);
    return out.length?out.join(' · '):'No issues reported.';
  }

  async function printWeeklyReport(){
    if(!state.admin || state.admin.role!=='super'){
      if(typeof showToast==='function') showToast('Upper Management access required.',true);
      return;
    }
    const weekStart=currentWeekStart();
    let rows=[];
    try{
      const headers=await authHeaders();
      const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(weekStart)+'&order=site_id.asc';
      const res=await fetch(url,{headers,cache:'no-store'});
      if(!res.ok) throw new Error('Weekly checks '+res.status);
      rows=await res.json();
    }catch(err){
      if(typeof showToast==='function') showToast('Could not load weekly report — '+(err&&err.message?err.message:'connection problem'),true);
      return;
    }

    const bySite=new Map(rows.map(function(r){return [String(r.site_id),r];}));
    const allSites=sites();
    const done=allSites.filter(function(s){return bySite.has(String(s.id));}).length;
    const tableRows=allSites.map(function(site){
      const r=bySite.get(String(site.id));
      const files=r&&Array.isArray(r.stock_files)?r.stock_files:[];
      return '<tr class="'+(r?'done':'outstanding')+'">'
        +'<td class="site">'+esc(site.name)+'</td>'
        +'<td class="status">'+(r?'DONE':'NOT DONE')+'</td>'
        +'<td>'+tick(r&&r.weekly_timesheet_done)+'</td>'
        +'<td>'+tick(r&&r.car_cleaning_done)+'</td>'
        +'<td>'+tick(r&&r.site_cleaning_done)+'</td>'
        +'<td>'+tick(r&&(r.stock_take_done||files.length))+'</td>'
        +'<td>'+tick(r&&r.oxy_acetylene_done)+'</td>'
        +'<td>'+(r?(r.flag_status==='issue'?'ISSUE':'OK'):'—')+'</td>'
        +'<td>'+(r?(r.mot_log_status==='issue'?'ISSUE':'OK'):'—')+'</td>'
        +'<td>'+esc(r?fmtDateTime(r.submitted_at):'—')+'</td>'
        +'<td>'+esc(r&&r.submitted_by_email?r.submitted_by_email:'—')+'</td>'
        +'</tr>';
    }).join('');
    const issueRows=allSites.map(function(site){
      const r=bySite.get(String(site.id));
      return '<tr><td class="site">'+esc(site.name)+'</td><td>'+esc(issueText(r))+'</td></tr>';
    }).join('');
    const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" alt="North East Auto Services">':'';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Weekly Site Completion Report</title><style>'
      +'@page{size:A4 landscape;margin:9mm;}*{box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:9px;}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:10px;}header img{max-width:170px;max-height:55px;}h1{font-size:22px;margin:0 0 3px;}h2{font-size:13px;margin:0;color:#555;font-weight:600;}.summary{display:flex;gap:8px;margin:9px 0 11px}.summary div{border:1px solid #bbb;padding:6px 9px;border-radius:5px;min-width:125px}.summary b{display:block;font-size:16px;margin-top:2px;}table{border-collapse:collapse;width:100%;margin-bottom:12px;}th,td{border:1px solid #aaa;padding:5px 4px;text-align:center;vertical-align:top;}th{background:#eee;font-size:8px;text-transform:uppercase;letter-spacing:.03em;}.site{text-align:left;font-weight:700;white-space:nowrap;}.status{font-weight:800;}.done .status{background:#e8f5ec;}.outstanding .status{background:#fde9e8;color:#a40000;}.issues td{text-align:left;font-size:8.5px;}.foot{font-size:8px;color:#666;margin-top:8px}.no-print{margin-top:10px}.no-print button{font-size:13px;padding:7px 12px}@media print{.no-print{display:none;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}'
      +'</style></head><body><header><div><h1>Weekly Site Completion Report</h1><h2>Week commencing '+esc(fmtDate(weekStart))+'</h2></div>'+logo+'</header>'
      +'<div class="summary"><div>Sites completed<b>'+done+' / '+allSites.length+'</b></div><div>Outstanding<b>'+(allSites.length-done)+'</b></div><div>Report printed<b>'+esc(new Date().toLocaleDateString('en-GB'))+'</b></div></div>'
      +'<table><thead><tr><th>Site</th><th>Status</th><th>Time sheet</th><th>Car clean</th><th>Site clean</th><th>Stock take</th><th>Gas checks</th><th>Flag</th><th>MOT log</th><th>Submitted</th><th>Manager</th></tr></thead><tbody>'+tableRows+'</tbody></table>'
      +'<h2 style="margin:6px 0;">Issues / notes</h2><table class="issues"><thead><tr><th style="width:18%;text-align:left;">Site</th><th style="text-align:left;">Status / notes</th></tr></thead><tbody>'+issueRows+'</tbody></table>'
      +'<div class="foot">North East Auto Services · Weekly checks completion report · Generated '+esc(new Date().toLocaleString('en-GB'))+'</div><div class="no-print"><button onclick="window.print()">Print</button></div>'
      +'</body></html>';
    const w=window.open('about:blank','_blank','width=1200,height=850');
    if(!w){ if(typeof showToast==='function') showToast('Allow pop-ups to print the weekly report.',true); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function(){ try{w.focus();w.print();}catch(_e){} },350);
  }

  try{
    if(typeof renderAdmin==='function'){
      const originalRenderAdmin=renderAdmin;
      renderAdmin=function(){
        const html=originalRenderAdmin();
        if(!state.admin || state.admin.tab!==TAB_KEY || state.admin.role!=='super') return html;
        const wrap=document.createElement('div');
        wrap.innerHTML=html;
        const main=wrap.querySelector('.admin-main');
        if(main && !main.querySelector('[data-weekly-print-report]')){
          const bar=document.createElement('div');
          bar.style.cssText='display:flex;justify-content:flex-end;margin:0 0 14px;';
          bar.innerHTML='<button type="button" class="add-btn" data-weekly-print-report>🖶 Print weekly all-sites report</button>';
          const top=main.querySelector('.admin-topbar');
          if(top) top.insertAdjacentElement('afterend',bar); else main.insertBefore(bar,main.firstChild);
        }
        return wrap.innerHTML;
      };
    }
  }catch(err){ console.error('Weekly checks print setup failed:',err); }

  document.addEventListener('click',function(e){
    const btn=e.target&&e.target.closest?e.target.closest('[data-weekly-print-report]'):null;
    if(!btn) return;
    e.preventDefault();
    printWeeklyReport();
  },true);
})();
