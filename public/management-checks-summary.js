(function(){
  'use strict';

  const WEEKLY_TAB='weeklychecks';
  const MONTHLY_TAB='monthlyhs';
  const NON_WORKSHOP_IDS=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']);
  const MONTHLY_CHECKS=[
    ['grinder','Grinder'],['oxy_acetylene','Oxy Acetylene'],['tyre_machine','Tyre Machine'],['ramps','Ramps'],
    ['brake_rollers','Brake Rollers'],['jacks','Jacks'],['wheel_balancers','Wheel Balancers'],['windy_tools','Windy Tools'],
    ['mig_welder','MIG Welder'],['gas_analyser','Gas Analyser'],['manual_handling','Manual Handling'],['racking_stacking','Racking & Stacking'],
    ['step_ladders','Step Ladders'],['housekeeping','Housekeeping'],['ppe','P.P.E.'],['coshh','COSHH']
  ];
  let weeklyState={week:'',rows:null,loading:false,error:''};
  const monthlyState=new Map();

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function isoLocal(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
  function mondayIso(){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return isoLocal(d);}
  function currentMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function fmtDate(v){if(!v)return '—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
  function fmtDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  function fmtMonth(v){const m=String(v||currentMonth()).slice(0,7),d=new Date(m+'-01T12:00:00');return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
  function sites(){return ((state.config&&state.config.sites)||[]).slice();}
  function siteFor(id){return sites().find(function(s){return String(s.id)===String(id);});}
  function isWorkshop(site){
    if(!site)return false;
    const id=String(site.id||''),name=String(site.name||'').toLowerCase();
    return !NON_WORKSHOP_IDS.has(id)&&!/petrol|filling station|floaters|upper management/.test(name)&&name!=='great ayton';
  }
  function workshopSites(){return sites().filter(isWorkshop).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});}
  function loanCarRequired(site){const n=String(site&&site.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return n.indexOf('gateshead')>=0||n.indexOf('chester le street')>=0;}
  function selectedWeeklySite(){
    const ws=workshopSites(),ids=new Set(ws.map(function(s){return String(s.id);}));
    let sid=String(state.admin.weeklySite||'');
    if(!ids.has(sid)){sid=ws[0]?String(ws[0].id):'';state.admin.weeklySite=sid;}
    return sid;
  }
  function selectedMonthlySite(){
    const ws=workshopSites(),ids=new Set(ws.map(function(s){return String(s.id);}));
    let sid=String(state.admin.monthlyHsSite||'');
    if(!ids.has(sid)){sid=ws[0]?String(ws[0].id):'';state.admin.monthlyHsSite=sid;}
    return sid;
  }
  function selectedMonth(){if(!state.admin.monthlyHsMonth)state.admin.monthlyHsMonth=currentMonth();return String(state.admin.monthlyHsMonth).slice(0,7);}

  function weeklyDone(r,site){
    if(!r)return false;
    const stock=!!r.stock_take_done||(Array.isArray(r.stock_files)&&r.stock_files.length>0);
    return !!(r.weekly_timesheet_done&&r.site_cleaning_done&&stock&&r.oxy_acetylene_done&&(!loanCarRequired(site)||r.car_cleaning_done));
  }
  function weeklyStatus(r,site){return weeklyDone(r,site)?'done':r?'draft':'missing';}
  function pill(status){
    const cls=status==='done'?'pill-approved':status==='draft'?'pill-pending':'pill-rejected';
    const txt=status==='done'?'DONE':status==='draft'?'DRAFT':'NOT DONE';
    return '<span class="pill '+cls+'">'+txt+'</span>';
  }
  function mark(v,na){if(na)return '<span style="color:var(--muted);font-weight:700;">N/A</span>';return v?'<span style="color:var(--green);font-weight:800;">✓ Complete</span>':'<span style="color:var(--red);font-weight:800;">Outstanding</span>';}
  function weeklyIssueText(r){
    if(!r)return 'No weekly check has been started.';
    const out=[];
    if(r.flag_status==='issue')out.push('Flag condition: issue');
    if(r.mot_log_status==='issue')out.push('MOT test log: issue');
    const maint=String(r.maintenance_status||'').trim();if(maint&&maint.toLowerCase()!=='ok')out.push('Maintenance: '+maint);
    const vehicles=String(r.vehicles_left_status||'').trim();if(vehicles&&vehicles.toLowerCase()!=='no vehicles left on site')out.push('Vehicles left: '+vehicles);
    const alarm=String(r.alarm_callout_status||'').trim();if(alarm&&alarm.toLowerCase()!=='not required')out.push('Alarm: '+alarm);
    const notes=String(r.notes||'').trim();if(notes)out.push(notes);
    return out.length?out.join(' · '):'No issues reported.';
  }

  async function loadWeekly(force){
    const wk=mondayIso();
    if(weeklyState.week!==wk)weeklyState={week:wk,rows:null,loading:false,error:''};
    if(weeklyState.loading||(!force&&weeklyState.rows))return;
    weeklyState.loading=true;weeklyState.error='';
    try{
      const headers=await authHeaders();
      const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(wk)+'&order=site_id.asc',{headers:headers,cache:'no-store'});
      if(!res.ok)throw new Error('Weekly checks '+res.status);
      weeklyState.rows=await res.json();
    }catch(e){weeklyState.rows=[];weeklyState.error=e&&e.message?e.message:'Could not load weekly checks.';}
    finally{weeklyState.loading=false;try{if(state.admin&&state.admin.role==='super'&&state.admin.tab===WEEKLY_TAB)render();}catch(_e){}}
  }

  function monthCache(month){
    const key=String(month).slice(0,7);
    if(!monthlyState.has(key))monthlyState.set(key,{rows:null,acks:new Map(),loading:false,error:''});
    return monthlyState.get(key);
  }
  async function loadMonthly(month,force){
    const c=monthCache(month);
    if(c.loading||(!force&&c.rows))return;
    c.loading=true;c.error='';
    try{
      const headers=await authHeaders();
      const res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&month_start=eq.'+encodeURIComponent(String(month).slice(0,7)+'-01')+'&order=site_id.asc',{headers:headers,cache:'no-store'});
      if(!res.ok)throw new Error('Monthly H&S '+res.status);
      c.rows=await res.json();c.acks=new Map();
      await Promise.all((c.rows||[]).filter(function(r){return r&&r.id;}).map(async function(r){
        const ar=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_acknowledgements?select=*&check_id=eq.'+encodeURIComponent(r.id)+'&revision=eq.'+encodeURIComponent(r.revision||1)+'&order=employee_name.asc',{headers:headers,cache:'no-store'});
        if(ar.ok)c.acks.set(String(r.id),await ar.json());
      }));
    }catch(e){c.rows=[];c.acks=new Map();c.error=e&&e.message?e.message:'Could not load monthly checks.';}
    finally{c.loading=false;try{if(state.admin&&state.admin.role==='super'&&state.admin.tab===MONTHLY_TAB)render();}catch(_e){}}
  }

  function weeklyRow(siteId){
    return (weeklyState.rows||[]).find(function(r){return String(r.site_id)===String(siteId);})||null;
  }
  function monthlyRow(siteId,month){
    return (monthCache(month).rows||[]).find(function(r){return String(r.site_id)===String(siteId);})||null;
  }
  function expectedStaff(check,acks){
    const map=new Map();
    (Array.isArray(check&&check.expected_staff)?check.expected_staff:[]).forEach(function(x){map.set(String(x.id),{id:String(x.id),name:String(x.name||'')});});
    (acks||[]).forEach(function(a){if(!map.has(String(a.employee_id)))map.set(String(a.employee_id),{id:String(a.employee_id),name:String(a.employee_name||'')});});
    return Array.from(map.values()).sort(function(a,b){return a.name.localeCompare(b.name);});
  }
  function ackInfo(check,acks){
    if(!check||check.status!=='published')return {done:0,total:0,text:'—',outstanding:[]};
    const staff=expectedStaff(check,acks),by=new Set((acks||[]).map(function(a){return String(a.employee_id);}));
    const outstanding=staff.filter(function(s){return !by.has(String(s.id));});
    return {done:staff.length-outstanding.length,total:staff.length,text:staff.length?(staff.length-outstanding.length)+' / '+staff.length:'0 / 0',outstanding:outstanding};
  }

  function weeklyReview(site,r){
    if(!site)return '';
    if(!r)return '<div class="card" style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;"><h3 style="font-size:19px;">'+esc(site.name)+'</h3>'+pill('missing')+'</div><div style="margin-top:10px;color:var(--muted);">No weekly check has been started for this site this week.</div></div>';
    const stock=!!r.stock_take_done||(Array.isArray(r.stock_files)&&r.stock_files.length>0),carNA=!loanCarRequired(site);
    return '<div class="card" style="margin-top:14px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h3 style="font-size:19px;">'+esc(site.name)+'</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">Week commencing '+esc(fmtDate(weeklyState.week))+'</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'+pill(weeklyStatus(r,site))+'<button type="button" class="btn-sm no-print" data-mgmt-weekly-print="'+esc(site.id)+'">🖶 Print this site</button></div></div>'
      +'<div style="overflow:auto;margin-top:12px;"><table><thead><tr><th style="text-align:left;">Check</th><th>Status</th></tr></thead><tbody>'
      +'<tr><td><b>Weekly timesheet</b></td><td>'+mark(!!r.weekly_timesheet_done,false)+'</td></tr>'
      +'<tr><td><b>Loan car cleaning</b></td><td>'+mark(!!r.car_cleaning_done,carNA)+'</td></tr>'
      +'<tr><td><b>Site cleaning rota</b></td><td>'+mark(!!r.site_cleaning_done,false)+'</td></tr>'
      +'<tr><td><b>Stock take</b></td><td>'+mark(stock,false)+'</td></tr>'
      +'<tr><td><b>Oxy/Acetylene checks</b></td><td>'+mark(!!r.oxy_acetylene_done,false)+'</td></tr>'
      +'<tr><td><b>Flag condition</b></td><td>'+esc(r.flag_status==='issue'?'ISSUE':'OK')+'</td></tr>'
      +'<tr><td><b>MOT test log</b></td><td>'+esc(r.mot_log_status==='issue'?'ISSUE':'UP TO DATE')+'</td></tr>'
      +'</tbody></table></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:10px;font-size:12px;"><div><b>Submitted</b><br>'+esc(fmtDateTime(r.submitted_at))+'</div><div><b>Manager</b><br>'+esc(r.submitted_by_email||'—')+'</div></div>'
      +'<div style="margin-top:12px;padding:10px 12px;border-left:4px solid '+(weeklyIssueText(r)==='No issues reported.'?'var(--green)':'var(--amber)')+';background:var(--bg-soft);font-size:12px;"><b>Issues / notes</b><div style="margin-top:4px;">'+esc(weeklyIssueText(r))+'</div></div>'
      +'</div>';
  }

  function renderWeeklyManagement(){
    const ws=workshopSites(),sid=selectedWeeklySite();
    if(!weeklyState.rows&&!weeklyState.loading)setTimeout(function(){loadWeekly(false);},0);
    if(weeklyState.loading&&!weeklyState.rows)return '<h2>Weekly Checks</h2><div class="card"><div class="empty-state">Loading weekly status…</div></div>';
    if(weeklyState.error)return '<h2>Weekly Checks</h2><div class="card" style="border-left:4px solid var(--red);">'+esc(weeklyState.error)+'</div>';
    const complete=ws.filter(function(s){return weeklyDone(weeklyRow(s.id),s);}).length;
    const rows=ws.map(function(s){
      const r=weeklyRow(s.id),st=weeklyStatus(r,s);
      return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+pill(st)+'</td><td>'+esc(r?fmtDateTime(r.submitted_at):'—')+'</td><td>'+esc(r&&r.submitted_by_email?r.submitted_by_email:'—')+'</td><td style="white-space:nowrap;"><button type="button" class="btn-sm" data-mgmt-weekly-site="'+esc(s.id)+'">View</button> <button type="button" class="btn-sm" data-mgmt-weekly-print="'+esc(s.id)+'" '+(!r?'disabled':'')+'>Print</button></td></tr>';
    }).join('');
    const selected=siteFor(sid),r=weeklyRow(sid);
    return '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h2>Weekly Checks</h2><div class="head-sub" style="margin-bottom:0;">Upper Management · simple site completion view</div></div><button type="button" class="btn-sm" data-mgmt-weekly-refresh>Refresh</button></div>'
      +'<div class="card" style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;"><div><h3 style="font-size:18px;">Workshop weekly status</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">Week commencing '+esc(fmtDate(weeklyState.week))+'</div></div><div style="font-size:14px;"><b>'+complete+'</b> of <b>'+ws.length+'</b> complete</div></div>'
      +'<div style="overflow:auto;"><table><thead><tr><th>Site</th><th>Status</th><th>Submitted</th><th>Manager</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
      +weeklyReview(selected,r);
  }

  function monthlyResult(v){return v==='ok'?'OK':v==='issue'?'ISSUE':v==='na'?'N/A':'NOT SET';}
  function monthlyPill(check){
    if(check&&check.status==='published')return '<span class="pill pill-approved">COMPLETED</span>';
    if(check)return '<span class="pill pill-pending">DRAFT</span>';
    return '<span class="pill pill-rejected">NOT DONE</span>';
  }
  function monthlyReview(site,check,acks,month){
    if(!site)return '';
    if(!check)return '<div class="card" style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;"><div><h3 style="font-size:19px;">'+esc(site.name)+'</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+esc(fmtMonth(month))+'</div></div>'+monthlyPill(null)+'</div><div style="margin-top:10px;color:var(--muted);">No Monthly H&amp;S check has been started for this site.</div></div>';
    const values=check.checks||check.draft_checks||{},ai=ackInfo(check,acks);
    const itemRows=MONTHLY_CHECKS.map(function(it){
      const r=values[it[0]]||{},result=monthlyResult(r.status);
      const colour=result==='ISSUE'?'var(--red)':result==='OK'?'var(--green)':'var(--muted)';
      return '<tr><td><b>'+esc(it[1])+'</b></td><td style="font-weight:800;color:'+colour+';">'+esc(result)+'</td><td>'+esc(r.note||'')+'</td></tr>';
    }).join('');
    const outstanding=ai.outstanding.length?ai.outstanding.map(function(s){return esc(s.name);}).join(', '):'None';
    return '<div class="card" style="margin-top:14px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h3 style="font-size:19px;">'+esc(site.name)+' · '+esc(fmtMonth(month))+'</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+(check.status==='published'?'Published '+esc(fmtDateTime(check.published_at))+(check.published_by_email?' by '+esc(check.published_by_email):''):'Saved as draft')+'</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'+monthlyPill(check)+'<button type="button" class="btn-sm no-print" data-mgmt-monthly-print="'+esc(site.id)+'">🖶 Print this site</button></div></div>'
      +'<div style="overflow:auto;margin-top:12px;"><table><thead><tr><th style="text-align:left;">Monthly check</th><th>Result</th><th style="text-align:left;">Notes / action</th></tr></thead><tbody>'+itemRows+'</tbody></table></div>'
      +'<div style="margin-top:12px;padding:10px 12px;background:var(--bg-soft);font-size:12px;"><b>Manager notes / actions</b><div style="margin-top:4px;">'+esc(check.manager_notes||check.draft_manager_notes||'—')+'</div></div>'
      +(check.status==='published'?'<div style="margin-top:12px;padding:10px 12px;border-left:4px solid '+(ai.total&&ai.done===ai.total?'var(--green)':'var(--amber)')+';background:var(--bg-soft);font-size:12px;"><b>Staff acknowledgement: '+esc(ai.text)+'</b><div style="margin-top:4px;"><b>Outstanding:</b> '+outstanding+'</div></div>':'')
      +'</div>';
  }

  function renderMonthlyManagement(){
    const month=selectedMonth(),c=monthCache(month),ws=workshopSites(),sid=selectedMonthlySite();
    if(!c.rows&&!c.loading)setTimeout(function(){loadMonthly(month,false);},0);
    if(c.loading&&!c.rows)return '<h2>Monthly H&S Checks</h2><div class="card"><div class="empty-state">Loading monthly status…</div></div>';
    if(c.error)return '<h2>Monthly H&S Checks</h2><div class="card" style="border-left:4px solid var(--red);">'+esc(c.error)+'</div>';
    const complete=ws.filter(function(s){const r=monthlyRow(s.id,month);return r&&r.status==='published';}).length;
    const rows=ws.map(function(s){
      const r=monthlyRow(s.id,month),acks=r?c.acks.get(String(r.id))||[]:[],ai=ackInfo(r,acks);
      return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+monthlyPill(r)+'</td><td>'+(r&&r.status==='published'?esc(ai.text):'—')+'</td><td>'+esc(r&&r.status==='published'?fmtDateTime(r.published_at):'—')+'</td><td style="white-space:nowrap;"><button type="button" class="btn-sm" data-mgmt-monthly-site="'+esc(s.id)+'">View</button> <button type="button" class="btn-sm" data-mgmt-monthly-print="'+esc(s.id)+'" '+(!r?'disabled':'')+'>Print</button></td></tr>';
    }).join('');
    const selected=siteFor(sid),check=monthlyRow(sid,month),acks=check?c.acks.get(String(check.id))||[]:[];
    return '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h2>Monthly H&amp;S Checks</h2><div class="head-sub" style="margin-bottom:0;">Upper Management · completion and staff acknowledgement view</div></div><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;"><label style="font-size:11px;color:var(--muted);">Month<input id="mgmt-monthly-month" type="month" value="'+esc(month)+'" max="'+esc(currentMonth())+'" style="display:block;margin-top:4px;"></label><button type="button" class="btn-sm" data-mgmt-monthly-refresh>Refresh</button></div></div>'
      +'<div class="card" style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;"><div><h3 style="font-size:18px;">Workshop monthly status</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+esc(fmtMonth(month))+'</div></div><div style="font-size:14px;"><b>'+complete+'</b> of <b>'+ws.length+'</b> completed</div></div>'
      +'<div style="overflow:auto;"><table><thead><tr><th>Site</th><th>Checks</th><th>Staff acknowledged</th><th>Published</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
      +monthlyReview(selected,check,acks,month);
  }

  function printShell(title,subtitle,body){
    const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" alt="North East Auto Services">':'';
    return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:12px}header img{max-width:175px;max-height:58px}h1{font-size:21px;margin:0 0 3px}h2{font-size:14px;margin:14px 0 6px}table{width:100%;border-collapse:collapse;margin:7px 0 12px}th,td{border:1px solid #999;padding:5px;vertical-align:top}th{background:#eee;text-align:left}.box{border:1px solid #aaa;padding:8px;margin:8px 0}.meta{font-size:10px;color:#444}.good{font-weight:700;color:#166534}.bad{font-weight:700;color:#a40000}.foot{font-size:8px;color:#666;margin-top:12px}.no-print{margin-top:12px}@media print{.no-print{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header><div><h1>'+esc(title)+'</h1><div class="meta">'+esc(subtitle)+'</div></div>'+logo+'</header>'+body+'<div class="foot">North East Auto Services · Generated '+esc(new Date().toLocaleString('en-GB'))+'</div><div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>';
  }
  function openPrint(html){
    const w=window.open('about:blank','_blank','width=1000,height=850');if(!w){showToast('Allow pop-ups to print this site.',true);return;}w.document.open();w.document.write(html);w.document.close();
  }
  function printWeeklySite(siteId){
    const site=siteFor(siteId),r=weeklyRow(siteId);if(!site||!r){showToast('No weekly check to print for this site.',true);return;}
    const stock=!!r.stock_take_done||(Array.isArray(r.stock_files)&&r.stock_files.length>0),carNA=!loanCarRequired(site);
    const row=function(label,ok,na){return '<tr><td><b>'+esc(label)+'</b></td><td class="'+(ok||na?'good':'bad')+'">'+(na?'N/A':ok?'Complete':'Outstanding')+'</td></tr>';};
    const body='<div class="box"><b>Status:</b> '+(weeklyDone(r,site)?'DONE':'OUTSTANDING')+'<br><b>Submitted:</b> '+esc(fmtDateTime(r.submitted_at))+'<br><b>Manager:</b> '+esc(r.submitted_by_email||'—')+'</div>'
      +'<h2>Weekly checks</h2><table><tbody>'+row('Weekly timesheet',!!r.weekly_timesheet_done,false)+row('Loan car cleaning',!!r.car_cleaning_done,carNA)+row('Site cleaning rota',!!r.site_cleaning_done,false)+row('Stock take',stock,false)+row('Oxy/Acetylene checks',!!r.oxy_acetylene_done,false)+'</tbody></table>'
      +'<h2>Site status</h2><table><tbody><tr><th>Flag condition</th><td>'+esc(r.flag_status==='issue'?'ISSUE':'OK')+'</td></tr><tr><th>MOT test log</th><td>'+esc(r.mot_log_status==='issue'?'ISSUE':'UP TO DATE')+'</td></tr><tr><th>Maintenance</th><td>'+esc(r.maintenance_status||'—')+'</td></tr><tr><th>Vehicles left</th><td>'+esc(r.vehicles_left_status||'—')+'</td></tr><tr><th>Alarm call-out</th><td>'+esc(r.alarm_callout_status||'—')+'</td></tr></tbody></table>'
      +'<h2>Issues / notes</h2><div class="box">'+esc(weeklyIssueText(r))+'</div>';
    openPrint(printShell('Weekly Checks · '+site.name,'Week commencing '+fmtDate(weeklyState.week),body));
  }
  function printMonthlySite(siteId){
    const month=selectedMonth(),site=siteFor(siteId),c=monthCache(month),check=monthlyRow(siteId,month);if(!site||!check){showToast('No monthly check to print for this site.',true);return;}
    const values=check.checks||check.draft_checks||{},acks=c.acks.get(String(check.id))||[],ai=ackInfo(check,acks);
    const rows=MONTHLY_CHECKS.map(function(it){const r=values[it[0]]||{};return '<tr><td><b>'+esc(it[1])+'</b></td><td>'+esc(monthlyResult(r.status))+'</td><td>'+esc(r.note||'')+'</td></tr>';}).join('');
    const staff=expectedStaff(check,acks),by=new Map(acks.map(function(a){return [String(a.employee_id),a];}));
    const ackRows=staff.map(function(s){const a=by.get(String(s.id));return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+(a?'ACKNOWLEDGED':'OUTSTANDING')+'</td><td>'+(a?esc(fmtDateTime(a.acknowledged_at)):'—')+'</td></tr>';}).join('');
    const body='<div class="box"><b>Status:</b> '+esc(check.status==='published'?'COMPLETED':'DRAFT')+'<br><b>Published:</b> '+esc(fmtDateTime(check.published_at))+'<br><b>Manager:</b> '+esc(check.published_by_email||'—')+'</div>'
      +'<h2>Monthly inspection</h2><table><thead><tr><th>Check</th><th>Result</th><th>Notes / action</th></tr></thead><tbody>'+rows+'</tbody></table>'
      +'<h2>Manager notes / actions</h2><div class="box">'+esc(check.manager_notes||check.draft_manager_notes||'—')+'</div>'
      +(check.status==='published'?'<h2>Staff acknowledgement · '+esc(ai.text)+'</h2><table><thead><tr><th>Employee</th><th>Status</th><th>Date / time</th></tr></thead><tbody>'+(ackRows||'<tr><td colspan="3">No staff on acknowledgement list.</td></tr>')+'</tbody></table>':'');
    openPrint(printShell('Monthly H&S Checks · '+site.name,fmtMonth(month),body));
  }

  function install(){
    if(typeof renderAdmin!=='function')return;
    if(renderAdmin.__mgmtChecksSummaryWrapped)return;
    const oldRender=renderAdmin;
    const wrapped=function(){
      const html=oldRender.apply(this,arguments);
      if(!state.admin||state.admin.role!=='super'||(state.admin.tab!==WEEKLY_TAB&&state.admin.tab!==MONTHLY_TAB))return html;
      if(state.admin.tab===WEEKLY_TAB&&!weeklyState.rows&&!weeklyState.loading)setTimeout(function(){loadWeekly(false);},0);
      if(state.admin.tab===MONTHLY_TAB){const m=selectedMonth(),c=monthCache(m);if(!c.rows&&!c.loading)setTimeout(function(){loadMonthly(m,false);},0);}
      const wrap=document.createElement('div');wrap.innerHTML=html;
      const main=wrap.querySelector('.admin-main');if(!main)return html;
      const top=main.querySelector('.admin-topbar');
      main.innerHTML=(top?top.outerHTML:'')+(state.admin.tab===WEEKLY_TAB?renderWeeklyManagement():renderMonthlyManagement());
      return wrap.innerHTML;
    };
    wrapped.__mgmtChecksSummaryWrapped=true;
    renderAdmin=wrapped;
  }

  if(!window.__mgmtChecksSummaryEvents){
    window.__mgmtChecksSummaryEvents=true;
    document.addEventListener('change',function(e){
      const t=e.target;if(!t)return;
      if(t.id==='mgmt-monthly-month'){
        state.admin.monthlyHsMonth=t.value||currentMonth();
        const c=monthCache(selectedMonth());c.rows=null;c.acks=new Map();c.error='';
        loadMonthly(selectedMonth(),true);try{render();}catch(_e){}
      }
    },true);
    document.addEventListener('click',function(e){
      const t=e.target&&e.target.closest?e.target.closest('[data-mgmt-weekly-site],[data-mgmt-weekly-print],[data-mgmt-weekly-refresh],[data-mgmt-monthly-site],[data-mgmt-monthly-print],[data-mgmt-monthly-refresh]'):null;
      if(!t)return;
      if(t.hasAttribute('data-mgmt-weekly-site')){e.preventDefault();state.admin.weeklySite=t.getAttribute('data-mgmt-weekly-site')||'';try{render();}catch(_e){}return;}
      if(t.hasAttribute('data-mgmt-weekly-print')){e.preventDefault();printWeeklySite(t.getAttribute('data-mgmt-weekly-print')||selectedWeeklySite());return;}
      if(t.hasAttribute('data-mgmt-weekly-refresh')){e.preventDefault();weeklyState.rows=null;weeklyState.error='';loadWeekly(true);return;}
      if(t.hasAttribute('data-mgmt-monthly-site')){e.preventDefault();state.admin.monthlyHsSite=t.getAttribute('data-mgmt-monthly-site')||'';try{render();}catch(_e){}return;}
      if(t.hasAttribute('data-mgmt-monthly-print')){e.preventDefault();printMonthlySite(t.getAttribute('data-mgmt-monthly-print')||selectedMonthlySite());return;}
      if(t.hasAttribute('data-mgmt-monthly-refresh')){e.preventDefault();const c=monthCache(selectedMonth());c.rows=null;c.acks=new Map();c.error='';loadMonthly(selectedMonth(),true);return;}
    },true);
  }

  setTimeout(install,0);
  setTimeout(install,250);
  setTimeout(install,1000);
  window.addEventListener('load',function(){setTimeout(install,50);setTimeout(install,600);});
})();