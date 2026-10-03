(function(){
'use strict';
const R=window.NEASFullReport;if(!R)return;
const P=R.productivity=R.productivity||{cache:{key:'',rows:[],busy:false,error:''}};

P.station=function(s){
 try{if(typeof isFillingStationSite==='function')return !!isFillingStationSite(s&&s.id)}catch(_e){}
 const n=String(s&&s.name||'').toLowerCase();
 return n.includes('great ayton')||n.includes('etac petrol')||n.includes('peterlee filling')||n.includes('peterlee convenience');
};
P.area=function(){
 if(!state.admin.reportBusinessArea)state.admin.reportBusinessArea='workshops';
 return state.admin.reportBusinessArea==='stations'?'stations':'workshops';
};
const allSites=R.sites;
R.sites=function(){
 const list=allSites();
 return list.filter(s=>P.area()==='stations'?P.station(s):!P.station(s));
};

P.key=function(p){return[p.start,p.end,p.month].join('|')};
P.load=async function(p,force){
 const key=P.key(p);if(P.cache.busy)return;if(!force&&P.cache.key===key)return;
 P.cache={key,busy:true,error:'',rows:P.cache.key===key?P.cache.rows:[]};
 try{
  const q='workshop_productivity_periods?select=*&period_start=gte.'+encodeURIComponent(p.start)+'&period_end=lte.'+encodeURIComponent(p.end)+'&order=period_start.asc,site_key.asc,technician.asc';
  P.cache.rows=await R.api(q);
 }catch(e){P.cache.error=e.message||String(e)}
 P.cache.busy=false;
 try{if(state.admin.tab==='fullreport')render()}catch(_e){}
};

P.norm=v=>String(v==null?'':v).toLowerCase().replace(/[^a-z0-9]+/g,'');
P.num=v=>{
 if(v==null||String(v).trim()==='')return null;
 const n=Number(String(v).replace(/[£,$%]/g,'').replace(/\s/g,''));
 return Number.isFinite(n)?n:null;
};
P.hours=v=>{
 if(v==null||String(v).trim()==='')return null;
 const s=String(v).trim().toLowerCase();
 const hm=s.match(/^(\d{1,3}):([0-5]?\d)$/);if(hm)return Number(hm[1])+Number(hm[2])/60;
 const words=s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?/);
 if(words)return Number(words[1])+(words[2]?Number(words[2])/60:0);
 return P.num(v);
};
P.date=v=>{
 const s=String(v||'').trim();if(!s)return'';
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
 if(m){let y=Number(m[3]);if(y<100)y+=2000;return String(y).padStart(4,'0')+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0')}
 const d=new Date(s);return Number.isNaN(d.getTime())?'':R.iso(d);
};
P.csv=function(text){
 const out=[],row=[];let cur='',q=false;
 for(let i=0;i<text.length;i++){const ch=text[i],nx=text[i+1];
  if(q){if(ch==='"'&&nx==='"'){cur+='"';i++}else if(ch==='"')q=false;else cur+=ch}
  else if(ch==='"')q=true;
  else if(ch===','){row.push(cur);cur=''}
  else if(ch==='\n'){row.push(cur);out.push(row.splice(0));cur=''}
  else if(ch!=='\r')cur+=ch;
 }
 row.push(cur);if(row.some(x=>String(x).trim()!==''))out.push(row);
 return out;
};
P.head=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
P.pick=function(map,aliases){
 for(const a of aliases){const k=P.head(a);if(map[k]!=null)return map[k]}
 return null;
};
P.siteFrom=function(v,selected){
 const list=allSites().filter(s=>!P.station(s));
 if(!String(v||'').trim())return selected&&selected!=='all'?list.find(s=>String(s.id)===String(selected))||null:null;
 const n=P.norm(v);
 return list.find(s=>P.norm(s.name)===n||P.norm(R.key(s))===n||P.norm(s.name).includes(n)||n.includes(P.norm(s.name)))||null;
};
P.openDays=function(siteId,p){
 try{
  const s=state.targetSheets&&state.targetSheets[p.month]&&state.targetSheets[p.month].sites&&state.targetSheets[p.month].sites[siteId];
  if(s&&Array.isArray(s.days))return s.days.filter(d=>d.open&&R.inr(d.date,p.start,p.end)&&(p.mode!=='saturdays'||d.saturday===true||Number(d.dow)===6)).length;
 }catch(_e){}
 let n=0;for(let d=p.start;d<=p.end;d=R.add(d,1)){const dow=R.fd(d).getDay();if(dow!==0&&(p.mode!=='saturdays'||dow===6))n++}return n;
};
P.sum=(a,k)=>a.reduce((n,x)=>n+(x[k]==null?0:R.n(x[k])),0);
P.has=(a,k)=>a.some(x=>x[k]!=null);
P.fmtPct=v=>v==null||!Number.isFinite(v)?'—':v.toFixed(1)+'%';
P.fmtNum=(v,d=2)=>v==null||!Number.isFinite(v)?'—':R.dec(v,d);
P.fmtMoney=v=>v==null||!Number.isFinite(v)?'—':R.money(v);

P.metrics=function(site,m){
 const rows=(P.cache.rows||[]).filter(x=>String(x.site_key)===String(R.key({name:site.name})));
 const summaries=rows.filter(x=>!String(x.technician||'').trim()),tech=rows.filter(x=>String(x.technician||'').trim());
 const base=summaries.length?summaries:tech;
 const byName=new Map((site.people||[]).map(e=>[P.norm(e.name),e]));
 let paid=null,matched=0,unmatched=0,used=new Set();
 if(tech.length){
  paid=0;
  tech.forEach(r=>{const e=byName.get(P.norm(r.technician));if(e&&!used.has(e.id)){used.add(e.id);paid+=R.n(e.hours);matched++}else if(!e)unmatched++});
 }
 const actual=P.has(base,'actual_job_hours')?P.sum(base,'actual_job_hours'):null;
 const sold=P.has(base,'labour_hours_sold')?P.sum(base,'labour_hours_sold'):null;
 const labourSales=P.has(base,'labour_sales')?P.sum(base,'labour_sales'):null;
 const labourProfit=P.has(base,'labour_profit')?P.sum(base,'labour_profit'):null;
 const jobs=P.has(base,'job_count')?P.sum(base,'job_count'):null;
 const invoices=P.has(base,'invoice_count')?P.sum(base,'invoice_count'):null;
 const invoiceValue=P.has(base,'invoice_value')?P.sum(base,'invoice_value'):null;
 const openDays=P.openDays(site.id,m.p);
 const util=paid!=null&&paid>0&&actual!=null?actual/paid*100:null;
 const eff=actual!=null&&actual>0&&sold!=null?sold/actual*100:null;
 const recovery=paid!=null&&paid>0&&sold!=null?sold/paid*100:null;
 const unused=paid!=null&&actual!=null?Math.max(0,paid-actual):null;
 const avgInvoice=invoices!=null&&invoices>0&&invoiceValue!=null?invoiceValue/invoices:null;
 const jobsDay=jobs!=null&&openDays>0?jobs/openDays:null;
 const salesPerTech=paid!=null&&paid>0?site.sales/paid:null;
 const files=[...new Set(rows.map(x=>String(x.source_file||'')).filter(Boolean))];
 let range='';if(rows.length){const starts=rows.map(x=>String(x.period_start)).sort(),ends=rows.map(x=>String(x.period_end)).sort();range=R.fmt(starts[0])+' to '+R.fmt(ends[ends.length-1])}
 return{rows,tech,paid,matched,unmatched,actual,sold,labourSales,labourProfit,jobs,invoices,invoiceValue,util,eff,recovery,unused,avgInvoice,jobsDay,salesPerTech,range,files};
};

P.html=function(m){
 if(P.area()==='stations'){
  return '<div class="card"><h3>Filling stations</h3><div style="color:var(--muted);">Filling-station staff and reporting are kept separate from workshop productivity, workshop targets and workshop wage analysis.</div></div>';
 }
 const sites=m.sites.filter(s=>s.workshop);
 if(!sites.length)return'';
 const rows=sites.map(s=>{const x=P.metrics(s,m),staffHours=R.n(s.hours),gp=s.margin==null?null:s.sales*R.n(s.margin)/100,gpHr=staffHours>0&&gp!=null?gp/staffHours:null;
  return '<tr><td><b>'+R.e(s.name)+'</b></td><td>'+R.dec(staffHours,2)+'</td><td>'+R.money(s.sales)+'</td><td>'+(staffHours?R.money(s.sales/staffHours):'—')+'</td><td>'+R.pct(s.margin)+'</td><td>'+P.fmtMoney(gp)+'</td><td>'+P.fmtMoney(gpHr)+'</td><td>'+P.fmtNum(x.paid,2)+'</td><td>'+P.fmtNum(x.actual,2)+'</td><td>'+P.fmtNum(x.sold,2)+'</td><td>'+P.fmtPct(x.util)+'</td><td>'+P.fmtPct(x.eff)+'</td><td>'+P.fmtPct(x.recovery)+'</td><td>'+P.fmtNum(x.unused,2)+'</td><td>'+P.fmtNum(x.jobsDay,2)+'</td><td>'+P.fmtMoney(x.avgInvoice)+'</td><td>'+P.fmtMoney(x.salesPerTech)+'</td><td>'+(x.range?R.e(x.range):'Not imported')+(x.unmatched?' · '+x.unmatched+' tech unmatched':'')+'</td></tr>';
 }).join('');
 let detail='';
 const sid=state.admin.reportPeriodSite||'all',sel=sid==='all'?null:sites.find(s=>String(s.id)===String(sid));
 if(sel){const x=P.metrics(sel,m);if(x.tech.length){const byName=new Map((sel.people||[]).map(e=>[P.norm(e.name),e]));
   detail='<details style="margin-top:12px;"><summary style="cursor:pointer;font-weight:800;">Technician detail · '+R.e(sel.name)+'</summary><div style="overflow:auto;margin-top:10px;"><table><thead><tr><th>Technician</th><th>Paid hrs</th><th>Actual job hrs</th><th>Sold hrs</th><th>Utilisation</th><th>Efficiency</th><th>Recovery</th><th>Unused</th><th>Labour sales</th><th>Labour profit</th><th>Jobs</th></tr></thead><tbody>'+x.tech.map(t=>{const e=byName.get(P.norm(t.technician)),paid=e?R.n(e.hours):null,actual=t.actual_job_hours==null?null:R.n(t.actual_job_hours),sold=t.labour_hours_sold==null?null:R.n(t.labour_hours_sold),util=paid&&actual!=null?actual/paid*100:null,eff=actual&&sold!=null?sold/actual*100:null,rec=paid&&sold!=null?sold/paid*100:null,unused=paid!=null&&actual!=null?Math.max(0,paid-actual):null;
    return '<tr><td><b>'+R.e(t.technician)+'</b>'+(e?'':' <span style="color:var(--amber);">unmatched</span>')+'</td><td>'+P.fmtNum(paid,2)+'</td><td>'+P.fmtNum(actual,2)+'</td><td>'+P.fmtNum(sold,2)+'</td><td>'+P.fmtPct(util)+'</td><td>'+P.fmtPct(eff)+'</td><td>'+P.fmtPct(rec)+'</td><td>'+P.fmtNum(unused,2)+'</td><td>'+P.fmtMoney(t.labour_sales==null?null:R.n(t.labour_sales))+'</td><td>'+P.fmtMoney(t.labour_profit==null?null:R.n(t.labour_profit))+'</td><td>'+P.fmtNum(t.job_count==null?null:R.n(t.job_count),0)+'</td></tr>';
   }).join('')+'</tbody></table></div></details>';
 }}
 const status=P.cache.busy?'Loading Autowork productivity…':P.cache.error?'<span style="color:var(--red);">'+R.e(P.cache.error)+'</span>':'Autowork figures appear when a Technician/Business Analysis CSV has been imported.';
 return '<details class="card" open><summary style="cursor:pointer;font-weight:800;">Workshop productivity</summary><div style="margin-top:10px;font-size:11px;color:var(--muted);">Shiftboard supplies paid attendance and sales. Autowork supplies actual job time, labour hours sold, labour sales/profit, jobs and invoice figures. Utilisation = actual job hours ÷ technician paid hours. Efficiency = sold hours ÷ actual job hours. Recovery = sold hours ÷ technician paid hours.</div><div class="no-print" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:8px;"><label style="margin:0;">Autowork CSV<input id="workshop-productivity-file" type="file" accept=".csv,text/csv" style="max-width:280px;"></label><button type="button" class="add-btn" data-productivity-refresh>Refresh data</button><span style="font-size:11px;color:var(--muted);">'+status+'</span></div><div style="overflow:auto;margin-top:12px;"><table style="min-width:1900px;"><thead><tr><th>Workshop</th><th>All staff paid hrs</th><th>Sales</th><th>Sales / staff hr</th><th>Margin</th><th>Est. gross profit</th><th>GP / staff hr</th><th>Technician paid hrs</th><th>Actual job hrs</th><th>Sold hrs</th><th>Utilisation</th><th>Efficiency</th><th>Recovery</th><th>Unused capacity hrs</th><th>Jobs / day</th><th>Avg invoice</th><th>Sales / tech paid hr</th><th>Autowork data</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+detail+'<div style="font-size:10px;color:var(--muted-2);margin-top:9px;">Technician paid hours are only calculated when technician names in the Autowork export match Shiftboard employee names. Missing or unmatched names are shown rather than estimated.</div></details>';
};

const oldView=R.view;
R.view=function(m){
 const html=oldView(m),card=P.html(m);
 const marker='<details class="card" open><summary style="cursor:pointer;font-weight:800;">';
 const i=html.indexOf(marker);
 return i>=0?html.slice(0,i)+card+html.slice(i):html+card;
};

const oldPanel=R.panel;
R.panel=function(){
 const allowed=R.sites(),sid=state.admin.reportPeriodSite||'all';
 if(sid!=='all'&&!allowed.some(s=>String(s.id)===String(sid)))state.admin.reportPeriodSite='all';
 const p=R.period(),key=P.key(p);if(P.cache.key!==key&&!P.cache.busy)setTimeout(()=>P.load(p,false),0);
 let html=oldPanel();
 const area='<label>Business area<select id="report-business-area"><option value="workshops" '+(P.area()==='workshops'?'selected':'')+'>Workshops</option><option value="stations" '+(P.area()==='stations'?'selected':'')+'>Filling stations</option></select></label>';
 html=html.replace('<label>Period<select id="report-pro-mode">',area+'<label>Period<select id="report-pro-mode">');
 return html;
};

P.importFile=async function(file){
 if(!file)return;const p=R.period(),sid=state.admin.reportPeriodSite||'all',text=await file.text(),grid=P.csv(text);
 if(grid.length<2)throw Error('The CSV has no data rows.');
 const headers=grid[0].map(P.head),alias={
  site:['site','branch','location','workshop','depot','site name','branch name'],
  tech:['technician','technician name','tech','employee','employee name','operative'],
  actual:['actual hours','actual job hours','actual time','job hours','productive hours','worked hours','time taken'],
  sold:['sold hours','hours sold','labour hours sold','sold time','quoted hours','quoted time','book time'],
  labourSales:['labour sales','labour value','labour sales value','labour turnover'],
  labourProfit:['labour profit','labour gross profit','gross profit'],
  jobs:['jobs','job count','jobs completed','number of jobs'],
  invoices:['invoices','invoice count','document count','documents'],
  invoiceValue:['invoice value','invoice total','invoice sales','document value','turnover','total invoice value'],
  start:['period start','from date','start date','date from'],
  end:['period end','to date','end date','date to']
 };
 const ix={};Object.keys(alias).forEach(k=>{ix[k]=headers.findIndex(h=>alias[k].map(P.head).includes(h))});
 const recognised=['actual','sold','labourSales','labourProfit','jobs','invoices','invoiceValue'].some(k=>ix[k]>=0);
 if(!recognised)throw Error('No recognised productivity columns found. Export Technician Efficiency / Technician Work / Business Analysis as CSV.');
 if(ix.site<0&&sid==='all')throw Error('This CSV has no Site/Branch column. Select one workshop in View and import the file again.');
 const out=[];
 for(let i=1;i<grid.length;i++){const row=grid[i];if(!row.some(x=>String(x).trim()!==''))continue;
  const site=P.siteFrom(ix.site>=0?row[ix.site]:'',sid);if(!site||P.station(site))continue;
  const start=ix.start>=0?P.date(row[ix.start]):p.start,end=ix.end>=0?P.date(row[ix.end]):p.end;
  if(!start||!end)continue;
  const tech=ix.tech>=0?String(row[ix.tech]||'').trim():'';
  out.push({
   period_start:start,period_end:end,site_key:R.key(site),site_name:site.name,technician:tech,
   actual_job_hours:ix.actual>=0?P.hours(row[ix.actual]):null,
   labour_hours_sold:ix.sold>=0?P.hours(row[ix.sold]):null,
   labour_sales:ix.labourSales>=0?P.num(row[ix.labourSales]):null,
   labour_profit:ix.labourProfit>=0?P.num(row[ix.labourProfit]):null,
   job_count:ix.jobs>=0?P.num(row[ix.jobs]):null,
   invoice_count:ix.invoices>=0?P.num(row[ix.invoices]):null,
   invoice_value:ix.invoiceValue>=0?P.num(row[ix.invoiceValue]):null,
   source_file:file.name||'Autowork CSV',raw:Object.fromEntries(headers.map((h,j)=>[h,row[j]??''])),
   imported_by:String((_session&&_session.email)||'').toLowerCase()
  });
 }
 if(!out.length)throw Error('No workshop rows could be matched. Check the branch names or select a single workshop before importing.');
 const h=await authHeaders();h['Prefer']='resolution=merge-duplicates,return=minimal';
 const res=await fetch(SUPABASE_URL+'/rest/v1/workshop_productivity_periods?on_conflict=period_start,period_end,site_key,technician',{method:'POST',headers:h,body:JSON.stringify(out)});
 if(!res.ok){let msg='';try{msg=(await res.json()).message||''}catch(_e){}throw Error(msg||('Import failed ('+res.status+')'))}
 await P.load(p,true);
 try{showToast(out.length+' Autowork productivity row'+(out.length===1?'':'s')+' imported.')}catch(_e){alert(out.length+' productivity rows imported.')}
};

document.addEventListener('change',e=>{
 const t=e.target;if(!t||state.admin.tab!=='fullreport')return;
 if(t.id==='report-business-area'){state.admin.reportBusinessArea=t.value==='stations'?'stations':'workshops';state.admin.reportPeriodSite='all';R.cache={key:'',busy:false,error:'',data:null};P.cache={key:'',rows:[],busy:false,error:''};render()}
 if(t.id==='workshop-productivity-file'&&t.files&&t.files[0]){P.importFile(t.files[0]).catch(err=>{try{showToast(err.message||String(err))}catch(_e){alert(err.message||String(err))}})}
},true);
document.addEventListener('click',e=>{const t=e.target&&e.target.closest&&e.target.closest('[data-productivity-refresh]');if(t&&state.admin.tab==='fullreport'){e.preventDefault();P.load(R.period(),true)}},true);
})();