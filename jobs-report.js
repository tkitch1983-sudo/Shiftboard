/* NEAS historical Jobs Report. Management sign-in required. All imported counts are provisional until approved. */
(function(){
'use strict';
const SITES={
 'seaham':'Seaham','peterlee':'Peterlee','middlesbrough':'Middlesbrough','hartlepool':'Hartlepool',
 'gateshead':'Gateshead','fairfield':'Fairfield','chester-le-street':'Chester-le-Street','lido':'Lido'
};
const ID_SITE={s1:'seaham',s2:'peterlee',s3:'middlesbrough',s4:'hartlepool',s5:'gateshead',s6:'fairfield',s7:'chester-le-street',s8:'lido'};
const J=window.NEASJobs=window.NEASJobs||{rows:null,progress:null,loading:false,error:'',period:'month',site:'all',date:'',lastLoad:0,showExceptions:true};
const E=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=x=>Number.isFinite(Number(x))?Number(x):0;
const F=x=>N(x).toLocaleString('en-GB',{maximumFractionDigits:0});
const dayISO=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parseDate=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12)};
const label=s=>parseDate(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const oneDay=(d,n)=>{const x=parseDate(d);x.setDate(x.getDate()+n);return dayISO(x)};
const today=()=>dayISO(new Date());
function canOpen(){
 return !!(_session&&state&&state.view==='admin'&&state.admin&&state.admin.authed&&
  (state.admin.role==='super'||(state.admin.role==='site'&&ID_SITE[state.admin.scopeSite])));
}
function isGroup(){return state.admin.role==='super';}
function selectedSite(){
 return isGroup()?J.site:(ID_SITE[state.admin.scopeSite]||'__none__');
}
function periodRange(date=J.date,mode=J.period){
 const dt=parseDate(date||today());
 if(mode==='day')return [date,date];
 if(mode==='week'){const monday=new Date(dt);monday.setDate(dt.getDate()-(dt.getDay()+6)%7);return [dayISO(monday),oneDay(dayISO(monday),6)]}
 if(mode==='year')return [String(dt.getFullYear())+'-01-01',String(dt.getFullYear())+'-12-31'];
 const last=new Date(dt.getFullYear(),dt.getMonth()+1,0,12);
 return [String(dt.getFullYear())+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-01',dayISO(last)];
}
function counts(rows){
 const total=rows.reduce((n,r)=>n+N(r.total_jobs),0);
 return {total,reports:rows.length,reportDays:new Set(rows.map(r=>r.report_date)).size,
  provisional:rows.filter(r=>r.import_status!=='verified').length};
}
function mostRecentBackfillDate(){
 // The already staged 13 Oct 2026 pilot must not conceal the 2024 onwards archive.
 const historic=(J.rows||[]).filter(r=>r.report_date<'2026-10-13');
 return historic.length?historic.reduce((best,r)=>r.report_date>best?r.report_date:best,''):'';
}
function selection(){
 const [a,b]=periodRange(),site=selectedSite();
 return (J.rows||[]).filter(r=>r.report_date>=a&&r.report_date<=b&&(site==='all'||r.site_key===site));
}
function previousRows(){
 const [a,b]=periodRange(),shift=-1;
 const priorStart=String(Number(a.slice(0,4))+shift)+a.slice(4);
 const priorEnd=String(Number(b.slice(0,4))+shift)+b.slice(4);
 const site=selectedSite();
 return (J.rows||[]).filter(r=>r.report_date>=priorStart&&r.report_date<=priorEnd&&(site==='all'||r.site_key===site));
}
function kpi(name,value,caption){
 return '<div class="card" style="padding:15px;min-width:145px;flex:1;">'+
 '<div style="color:var(--muted);font-size:12px;">'+E(name)+'</div>'+
 '<div style="font-family:Oswald,sans-serif;font-size:32px;font-weight:700;margin:6px 0;">'+E(value)+'</div>'+
 '<div style="color:var(--muted);font-size:11px;">'+E(caption)+'</div></div>';
}
async function load(force=false){
 if(!canOpen()||J.loading)return;
 if(!force&&J.rows&&Date.now()-J.lastLoad<120000)return;
 J.loading=true;J.error='';
 try{
  const headers=await authHeaders();
  const out=[];
  for(let offset=0;offset<20000;offset+=1000){
   const q='jobs_report_management?select=site_key,report_date,import_status,total_jobs&order=report_date.desc,site_key.asc&limit=1000&offset='+offset;
   const res=await fetch(SUPABASE_URL+'/rest/v1/'+q,{headers,cache:'no-store'});
   if(!res.ok)throw Error('Cannot load management jobs report (HTTP '+res.status+').');
   const page=await res.json();
   if(!Array.isArray(page))throw Error('Invalid reporting data returned.');
   out.push(...page);
   if(page.length<1000)break;
   if(offset===19000)throw Error('History exceeds safe query limit.');
  }
  J.rows=out;J.lastLoad=Date.now();
  if(!J.userPickedDate&&!J.initialRangeSet){
    // Show the latest backfilled historical month first, not today's empty date.
    const historical=mostRecentBackfillDate();
    J.date=historical||out[0]?.report_date||today();
    J.period='month';
    J.initialRangeSet=true;
  }
  if(isGroup()){
   const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/jobs_report_import_progress',{
    method:'POST',headers,cache:'no-store',body:'{}'});
   J.progress=res.ok?await res.json():null;
  }else J.progress=null;
 }catch(e){
  J.error=e&&e.message||'Report unavailable';
  if(!J.rows)J.rows=[];
 }finally{
  J.loading=false;
  if(state?.view==='admin'&&state.admin?.tab==='jobs'&&typeof render==='function')render();
 }
}
function makeBars(rows){
 const mode=J.period,perMonth=mode==='year';
 const groups=new Map();
 rows.forEach(r=>{
  const key=perMonth?r.report_date.slice(0,7):r.report_date;
  groups.set(key,(groups.get(key)||0)+N(r.total_jobs));
 });
 const points=[...groups].sort((a,b)=>a[0].localeCompare(b[0])).slice(-35);
 if(!points.length)return '<div style="color:var(--muted);padding:16px 0;">No imported reports for the selected period.</div>';
 const max=Math.max(1,...points.map(p=>p[1]));
 return '<div style="display:flex;gap:5px;align-items:end;height:142px;border-bottom:1px solid var(--line);margin:15px 0 6px;">'+
  points.map(([key,value])=>'<div title="'+E(key+' · '+F(value)+' jobs')+
   '" style="display:flex;align-items:end;justify-content:center;flex:1;min-width:3px;max-width:42px;height:100%;">'+
   '<div style="height:'+Math.max(2,Math.round(value/max*130))+
   'px;width:86%;border-radius:4px 4px 0 0;background:var(--amber);"></div></div>').join('')+'</div>'+
  '<div style="display:flex;justify-content:space-between;color:var(--muted);font-size:11px;"><span>'+
  E(points[0][0])+'</span><span>'+E(points[points.length-1][0])+'</span></div>';
}
function branchTable(rows){
 const branches=Object.entries(SITES).filter(([site])=>selectedSite()==='all'||selectedSite()===site);
 const entries=branches.map(([site,name])=>({name,...counts(rows.filter(r=>r.site_key===site))}));
 return '<div style="display:flex;flex-direction:column;gap:0;">'+
  entries.map(t=>'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;'+
    'padding:13px 2px;border-bottom:1px solid var(--line);">'+
    '<div><b>'+E(t.name)+'</b><div style="font-size:11px;color:var(--muted);">'+
    F(t.reports)+' available report'+(t.reports===1?'':'s')+'</div></div>'+
    '<div style="font-family:Oswald,sans-serif;font-weight:700;font-size:25px;white-space:nowrap;">'+
    (t.reports?F(t.total):'—')+'</div></div>').join('')+'</div>';
}
function dailyTable(rows){
 const by=rows.slice().sort((a,b)=>b.report_date.localeCompare(a.report_date)||
   String(a.site_key).localeCompare(String(b.site_key)));
 const shown=by.slice(0,180);
 const cards=shown.map(r=>
  '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;'+
  'padding:12px 2px;border-bottom:1px solid var(--line);">'+
  '<div><b>'+E(SITES[r.site_key]||r.site_key)+'</b><div style="font-size:12px;color:var(--muted);">'+
  E(label(r.report_date))+' · '+(r.import_status==='verified'?'Approved':'Provisional')+'</div></div>'+
  '<div style="text-align:right;white-space:nowrap;">'+
  '<b style="font-family:Oswald,sans-serif;font-size:24px;">'+F(r.total_jobs)+'</b>'+
  '<div style="font-size:11px;color:var(--muted);">jobs</div></div></div>'
 ).join('');
 return '<div>'+ (cards||'<div style="color:var(--muted);padding:16px 0;">No reports available for these dates.</div>') +'</div>'+
 (by.length>shown.length?'<div style="color:var(--muted);font-size:11px;margin:10px 0;">Showing newest '+
 shown.length+' of '+by.length+' branch-days. Narrow the date filter to see more.</div>':'');
}
function csv(){
 const rows=selection();
 const data=[['Invoice date','Workshop','Total jobs','Status']];
 rows.forEach(r=>data.push([r.report_date,SITES[r.site_key]||r.site_key,r.total_jobs,
  r.import_status==='verified'?'Approved':'Provisional']));
 const safe=x=>'"'+String(x==null?'':x).replace(/^[=+\-@\t\r]/,"'").replace(/"/g,'""')+'"';
 const content=data.map(row=>row.map(safe).join(',')).join('\r\n');
 const blob=new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='NEAS-Total-Jobs-'+(J.date||today())+'-'+J.period+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function progressSection(){
 const p=J.progress;
 if(!isGroup()||!p)return '';
 return '<div class="card" style="margin:12px 0;">'+
  '<b>Historic import progress</b><div style="display:flex;gap:20px;flex-wrap:wrap;margin:12px 0;font-size:13px;">'+
  '<span><b>'+F(p.days_attempted)+'</b> received dates checked</span>'+
  '<span><b>'+F(p.staged_branch_days)+'</b> staged branch-day reports</span>'+
  '<span><b>'+F(p.days_with_exceptions)+'</b> days with exceptions</span>'+
  '</div><div style="color:var(--muted);font-size:12px;">'+
  (p.latest_received_date_attempted?'Historical run reached received date '+E(label(p.latest_received_date_attempted))+'. ':'')+
  (p.scheduler_active?'Import is still running in the background.':'Scheduled archive importer is not currently running.')+
  ' A received date is not necessarily the invoice date. Missing reports are not zero jobs.</div></div>';
}
function renderJobs(){
 if(!canOpen())return '<div class="card">Please sign in through Management to view the Jobs Report.</div>';
 if(!J.date)J.date=today();
 if(!J.rows&&!J.loading)setTimeout(()=>load(),0);
 const rows=selection(),current=counts(rows),prev=counts(previousRows());
 const periods=[['day','Day'],['week','Week'],['month','Month'],['year','Year']];
 const periodOptions=periods.map(([id,name])=>'<option value="'+id+'"'+
  (J.period===id?' selected':'')+'>'+name+'</option>').join('');
 const site=selectedSite(),sites=Object.entries(SITES).filter(([id])=>isGroup()||id===site);
 const siteOptions=(isGroup()?'<option value="all">All workshops</option>':'')+
  sites.map(([id,name])=>'<option value="'+id+'"'+(site===id?' selected':'')+'>'+E(name)+'</option>').join('');
 const [start,end]=periodRange();
 const latestBackfill=mostRecentBackfillDate();
 const comparison=prev.reports>0?
  F(prev.total)+' jobs in the comparable period last year, from '+F(prev.reports)+
  ' available branch-day reports. This year has '+F(current.reports)+' reports.':
  'No imported reports for the comparable period last year yet.';
 return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">'+
  '<div><h2>Jobs Report</h2><div class="head-sub">Total invoiced jobs · workshop history</div></div>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="add-btn" data-jobs-action="refresh">Refresh</button>'+
  '<button type="button" class="add-btn" data-jobs-action="csv"'+(rows.length?'':' disabled')+'>Export CSV</button></div></div>'+
  '<div class="card" style="margin:12px 0;border-left:4px solid var(--amber);font-size:13px;">'+
  '<b>Import still being checked.</b> Jobs are counted once per workshop and invoice day. '+
  'Missing day sheets are not treated as zero jobs. Figures remain provisional until approved.</div>'+
  '<div class="card" style="margin:12px 0;padding:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">'+
  '<div><b>Historical imports</b><div style="color:var(--muted);font-size:12px;margin-top:4px;">'+
  (J.rows?F(J.rows.length)+' branch-day reports available':'Loading import history…')+
  (latestBackfill?' · latest backfill: '+E(label(latestBackfill)):'')+
  '</div></div>'+
  '<button type="button" class="add-btn" data-jobs-action="history"'+(latestBackfill?'':' disabled')+'>View imported history →</button></div>'+
  '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;">'+
  '<label style="display:flex;flex-direction:column;font-size:12px;gap:5px;">Period<select data-jobs-filter="period" style="min-width:110px;padding:10px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;">'+periodOptions+'</select></label>'+
  '<label style="display:flex;flex-direction:column;font-size:12px;gap:5px;">Date<input type="date" min="2024-10-12" value="'+E(J.date)+'" data-jobs-filter="date" style="min-width:150px;padding:10px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;"></label>'+
  '<label style="display:flex;flex-direction:column;font-size:12px;gap:5px;">Workshop<select data-jobs-filter="site" style="min-width:160px;max-width:230px;padding:10px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;">'+siteOptions+'</select></label></div>'+
  '<div style="color:var(--muted);font-size:12px;margin:8px 0;">'+E(label(start))+' – '+E(label(end))+
  ' · '+F(current.reports)+' available branch-day reports</div>'+
  (J.loading?'<div class="card">Loading historical job reports…</div>':'')+
  (J.error?'<div class="card" style="color:var(--red);">Could not refresh: '+E(J.error)+'</div>':'')+
  '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
  kpi('Total jobs',J.rows?F(current.total):'—','Unique invoiced job references')+
  kpi('Average jobs per branch-day',current.reports?(current.total/current.reports).toFixed(1):'—',
   F(current.reports)+' branch-day reports available')+'</div>'+
  '<div class="card" style="margin-top:12px;"><b>Same period last year</b>'+
  '<div style="color:var(--muted);font-size:13px;margin-top:7px;">'+E(comparison)+'</div>'+
  '<div style="color:var(--muted);font-size:11px;margin-top:7px;">Historical comparisons are incomplete while more reports are importing.</div></div>'+
  progressSection()+
  '<div class="card" style="margin-top:12px;"><b>Job volume trend</b><div style="font-size:11px;color:var(--muted);margin-top:5px;">'+
  (J.period==='year'?'Monthly totals':'Daily totals')+' · imported reports only</div>'+makeBars(rows)+'</div>'+
  '<div class="card" style="margin-top:12px;"><b>Total jobs by workshop</b><div style="font-size:12px;color:var(--muted);margin:5px 0 10px;">— means no available reports, not zero jobs.</div>'+
  branchTable(rows)+'</div>'+
  '<div class="card" style="margin-top:12px;"><b>Jobs by date and workshop</b>'+
  '<div style="font-size:12px;color:var(--muted);margin:6px 0 12px;">'+
  F(current.reports)+' imported reports · last refreshed '+
  (J.lastLoad?new Date(J.lastLoad).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—')+
  '</div>'+dailyTable(rows)+'</div>';
}
document.addEventListener('change',e=>{
 const el=e.target?.closest?.('[data-jobs-filter]');
 if(!el||!canOpen()||state.admin.tab!=='jobs')return;
 const key=el.dataset.jobsFilter;
 if(key==='period'&&['day','week','month','year'].includes(el.value)){J.period=el.value;J.userPickedDate=true;}
 if(key==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(el.value)){J.date=el.value;J.userPickedDate=true;}
 if(key==='site'&&isGroup()&&(el.value==='all'||SITES[el.value]))J.site=el.value;
 if(typeof render==='function')render();
});
document.addEventListener('click',e=>{
 const el=e.target?.closest?.('[data-jobs-action]');
 if(!el||!canOpen()||state.admin.tab!=='jobs')return;
 e.preventDefault();if(el.dataset.jobsAction==='refresh')load(true);
 if(el.dataset.jobsAction==='csv'&&J.rows)csv();
 if(el.dataset.jobsAction==='history'&&J.rows){
  const historical=mostRecentBackfillDate();
  if(historical){
   J.date=historical;J.period='month';J.userPickedDate=true;
   if(isGroup())J.site='all';
   if(typeof render==='function')render();
  }
 }
});
J.render=renderJobs;J.load=load;
})();