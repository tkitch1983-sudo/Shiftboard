/* Shiftboard Jobs Per Day: management-only, read-only historical reporting. */
(function(){
'use strict';
const siteNames={
 'seaham':'Seaham','peterlee':'Peterlee','middlesbrough':'Middlesbrough',
 'hartlepool':'Hartlepool','gateshead':'Gateshead','fairfield':'Fairfield',
 'chester-le-street':'Chester-le-Street','lido':'Lido'
};
const J=window.NEASJobs=window.NEASJobs||{
 rows:null,loading:false,error:'',site:'all',period:'month',date:'',loadedAt:''
};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
function num(n){const x=Number(n);return Number.isFinite(x)?x:0;}
function int(n){return Math.round(num(n)).toLocaleString('en-GB');}
function money(n){return '£'+num(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateOf(v){const a=String(v).slice(0,10).split('-').map(Number);return new Date(a[0],a[1]-1,a[2],12);}
function dateLabel(v){try{return dateOf(v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch(_e){return String(v);}}
function range(){
 const d=J.date||ymd(new Date()),dt=dateOf(d),mode=J.period;
 if(mode==='day')return[d,d];
 if(mode==='week'){const mon=new Date(dt);mon.setDate(dt.getDate()-(dt.getDay()+6)%7);const sun=new Date(mon);sun.setDate(mon.getDate()+6);return[ymd(mon),ymd(sun)];}
 if(mode==='year')return[d.slice(0,4)+'-01-01',d.slice(0,4)+'-12-31'];
 const end=new Date(dt.getFullYear(),dt.getMonth()+1,0,12);
 return[d.slice(0,7)+'-01',ymd(end)];
}
function filtered(){
 const [a,b]=range();
 return (J.rows||[]).filter(r=>r.report_date>=a&&r.report_date<=b&&(J.site==='all'||r.site_key===J.site));
}
function summary(rows){
 return rows.reduce((s,r)=>({total:s.total+num(r.total_jobs),service:s.service+num(r.service_repair_confirmed),
 review:s.review+num(r.review_jobs),sales:s.sales+num(r.net_sales_ex_vat)}),{total:0,service:0,review:0,sales:0});
}
async function ensureLoaded(force){
 if(J.loading || (J.rows&&!force))return;
 J.loading=true;J.error='';
 try{
  const h=await authHeaders();
  const collected=[];
  // Supabase/PostgREST can cap responses at 1000. Page until exhausted.
  for(let offset=0;offset<20000;offset+=1000){
   const u=SUPABASE_URL+'/rest/v1/jobs_daily_summary?select=site_key,report_date,total_jobs,service_repair_confirmed,review_jobs,net_sales_ex_vat,credit_count&order=report_date.desc,site_key.asc&limit=1000&offset='+offset;
   const res=await fetch(u,{headers:h,cache:'no-store'});
   if(!res.ok)throw Error(res.status===404?'Jobs history database migration has not been applied.':'Jobs history HTTP '+res.status);
   const page=await res.json();
   if(!Array.isArray(page))throw Error('Invalid Jobs history response');
   collected.push(...page);
   if(page.length<1000)break;
   if(offset>=19000)throw Error('Jobs history exceeds reporting limit');
  }
  J.rows=collected;
  if(!J.date)J.date=collected[0]?.report_date||ymd(new Date());
  J.loadedAt=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
 }catch(e){J.error=e?.message||String(e);J.rows=[];}
 finally{J.loading=false;if(state?.view==='admin'&&state.admin.tab==='jobs'&&typeof render==='function')render();}
}
function metric(label,value,description){
 return '<div class="card" style="padding:16px;min-width:150px;flex:1;"><div style="color:var(--muted);font-size:12px;">'+esc(label)+'</div><div style="font-family:Oswald,sans-serif;font-size:35px;font-weight:700;margin:5px 0;">'+esc(value)+'</div><div style="color:var(--muted);font-size:11px;">'+esc(description)+'</div></div>';
}
function render(){
 if(!state?.admin?.authed)return '<div class="card">Management login required.</div>';
 if(!J.date)J.date=ymd(new Date());
 if(!J.rows&&!J.loading)setTimeout(()=>ensureLoaded(false),0);
 const chosen=filtered(),s=summary(chosen);
 const canGroup=state.admin.role==='super';
 const siteIds={s1:'seaham',s2:'peterlee',s3:'middlesbrough',s4:'hartlepool',
  s5:'gateshead',s6:'fairfield',s7:'chester-le-street',s8:'lido'};
 if(!canGroup)J.site=siteIds[state.admin.scopeSite]||'__none__';
 const sites=Object.entries(siteNames).filter(([k])=>canGroup||k===J.site);
 const sitePick='<select data-jobs-filter="site" aria-label="Workshop" style="padding:9px;background:var(--panel);color:var(--text);border:1px solid var(--line);">'+
  (canGroup?'<option value="all">All workshops</option>':'')+
  sites.map(([k,name])=>'<option value="'+k+'"'+(J.site===k?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select>';
 const periodPick='<select data-jobs-filter="period" aria-label="Reporting period" style="padding:9px;background:var(--panel);color:var(--text);border:1px solid var(--line);">'+
  [['day','Day'],['week','Week'],['month','Month'],['year','Year']].map(([k,name])=>'<option value="'+k+'"'+(J.period===k?' selected':'')+'>'+name+'</option>').join('')+'</select>';
 const chartData=new Map();
 chosen.forEach(r=>{const d=r.report_date;chartData.set(d,(chartData.get(d)||0)+num(r.total_jobs));});
 const points=[...chartData].sort((a,b)=>a[0].localeCompare(b[0])).slice(-35);
 const max=Math.max(1,...points.map(x=>x[1]));
 const chart=points.map(([date,count])=>'<div title="'+esc(dateLabel(date))+' · '+int(count)+' jobs" style="flex:1;min-width:5px;max-width:32px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:145px;gap:4px;"><div style="background:var(--amber);width:80%;min-height:2px;height:'+Math.max(2,Math.round(count/max*120))+'px;"></div></div>').join('');
 const body=chosen.slice().sort((a,b)=>String(b.report_date).localeCompare(String(a.report_date))||String(a.site_key).localeCompare(String(b.site_key)))
  .slice(0,400).map(r=>'<tr><td>'+esc(dateLabel(r.report_date))+'</td><td>'+esc(siteNames[r.site_key]||r.site_key)+'</td><td class="mono">'+int(r.total_jobs)+'</td><td class="mono">'+int(r.service_repair_confirmed)+'</td><td class="mono">'+int(r.review_jobs)+'</td><td class="mono">'+money(r.net_sales_ex_vat)+'</td></tr>').join('');
 return '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;"><div><h2>Jobs Per Day</h2><div style="color:var(--muted);font-size:12px;margin-top:4px;">Verified invoiced jobs, with service/repair classifications shown separately</div></div>'+
 '<button class="add-btn" type="button" data-jobs-refresh="1">Refresh</button></div>'+
 '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;">'+sitePick+periodPick+
 '<input type="date" value="'+esc(J.date)+'" data-jobs-filter="date" aria-label="Reference date" style="padding:9px;background:var(--panel);color:var(--text);border:1px solid var(--line);"></div>'+
 (J.loading?'<div class="card">Loading historical jobs…</div>':'')+
 (J.error?'<div class="card" style="color:var(--red);">'+esc(J.error)+'</div>':'')+
 '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+metric('Total invoiced jobs',int(s.total),'Each job counted once per branch/date')+
 metric('Service / repair',int(s.service),'Labour-coded; classification under review')+
 metric('Needs classification',int(s.review),'Not yet included in service / repair')+
 metric('Net sales',money(s.sales),'Only available imported reports')+'</div>'+
 '<div class="card" style="margin-top:12px;"><b>Daily job volume</b><div style="font-size:11px;color:var(--muted);margin-top:5px;">Last '+points.length+' available reporting dates in this selection</div>'+
 (points.length?'<div style="display:flex;gap:3px;align-items:flex-end;margin-top:14px;border-bottom:1px solid var(--line);">'+chart+'</div>':'<div style="color:var(--muted);padding:20px 0;">No verified job reports imported for this period.</div>')+'</div>'+
 '<div class="card" style="margin-top:12px;"><b>Job history by branch</b><div style="color:var(--muted);font-size:12px;margin:7px 0;">'+chosen.length+' verified branch-day reports · last refresh '+esc(J.loadedAt||'—')+'. Missing reports are unknown, not zero. Service/repair counts can increase after classification review.</div>'+
 '<div style="overflow:auto;"><table style="min-width:650px;width:100%;"><thead><tr><th>Date</th><th>Site</th><th>Total jobs</th><th>Service / repair*</th><th>Review</th><th>Net sales</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
 (chosen.length>400?'<div style="font-size:12px;color:var(--muted);">Showing newest 400 rows; choose a narrower period to see the rest.</div>':'')+'</div>';
}
document.addEventListener('change',e=>{
 const el=e.target;
 if(!el||!el.matches?.('[data-jobs-filter]'))return;
 const key=el.getAttribute('data-jobs-filter');
 if(key==='site')J.site=el.value;
 if(key==='period')J.period=el.value;
 if(key==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(el.value))J.date=el.value;
 if(state?.admin?.tab==='jobs'&&typeof render==='function')render();
});
document.addEventListener('click',e=>{
 if(!e.target?.closest?.('[data-jobs-refresh]'))return;
 e.preventDefault();ensureLoaded(true);
});
J.render=render;J.ensureLoaded=ensureLoaded;
})();
