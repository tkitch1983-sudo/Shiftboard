/* Daily Profit Tracker review. Financial data remains under management RLS. */
(function(){
'use strict';
const J=window.NEASJobs;if(!J)return;
const original=J.render;
const sites={'seaham':'Seaham','peterlee':'Peterlee','middlesbrough':'Middlesbrough','hartlepool':'Hartlepool','gateshead':'Gateshead','fairfield':'Fairfield','chester-le-street':'Chester-le-Street','lido':'Lido'};
const keys={s1:'seaham',s2:'peterlee',s3:'middlesbrough',s4:'hartlepool',s5:'gateshead',s6:'fairfield',s7:'chester-le-street',s8:'lido'};
const P={view:'margins',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),site:'all',filter:'low',rows:[],reports:[],statuses:[],invoices:[],loading:false,error:'',loaded:'',at:0,owner:''};
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('en-GB',{style:'currency',currency:'GBP'});
const allowed=()=>!!(_session&&state?.view==='admin'&&state.admin?.authed&&(state.admin.role==='super'||(state.admin.role==='site'&&keys[state.admin.scopeSite])));
const group=()=>state.admin.role==='super';
const site=()=>group()?P.site:keys[state.admin.scopeSite];
const owner=()=>_session?.email+'|'+_session?.role+'|'+_session?.siteId;
const queryKey=()=>owner()+'|'+P.date+'|'+site();
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
function redraw(){if(allowed()&&state.admin.tab==='jobs')render();}
async function fetchRows(table,headers,filter){
 const out=[];
 for(let offset=0;offset<10000;offset+=1000){
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+table+'?select=*&report_date=eq.'+P.date+filter+'&limit=1000&offset='+offset,{headers,cache:'no-store'});
  if(!r.ok)throw Error('Could not load margin report (HTTP '+r.status+').');
  const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid report response');
  out.push(...rows);if(rows.length<1000)return out;
 }
 throw Error('Report is too large to display safely. Choose one workshop.');
}
async function load(force=false){
 if(!allowed()||P.loading)return;
 const key=queryKey();if(!force&&key===P.loaded&&Date.now()-P.at<120000)return;
 P.loading=true;P.error='';P.rows=[];P.reports=[];P.statuses=[];P.invoices=[];
 try{
  const headers=await authHeaders();const filter=site()==='all'?'':'&site_key=eq.'+encodeURIComponent(site());
  const [rows,reports,statuses,invoices]=await Promise.all([
   fetchRows('jobs_margin_review',headers,filter),fetchRows('jobs_report_management',headers,filter),fetchRows('jobs_direct_import_status',headers,filter),fetchRows('jobs_invoice_documents',headers,filter)
  ]);
  if(!allowed()||queryKey()!==key)return;
  P.rows=rows;P.reports=reports;P.statuses=statuses;P.invoices=invoices;P.loaded=key;P.at=Date.now();
 }catch(e){if(allowed()&&queryKey()===key){P.error=e.message||'Report unavailable';P.loaded=key;P.at=Date.now();}}
 finally{P.loading=false;redraw();}
}
const low=r=>r.margin_pct!==null&&Number(r.margin_pct)<=45;
function selected(){
 return P.rows.filter(r=>P.filter==='all'||(P.filter==='low'&&low(r))||(P.filter==='review'&&low(r)&&r.job_type!=='tyre_only')||(P.filter==='tyres'&&low(r)&&r.job_type==='tyre_only')||(P.filter==='checks'&&r.margin_pct===null))
 .sort((a,b)=>(a.margin_pct===null?-Infinity:Number(a.margin_pct))-(b.margin_pct===null?-Infinity:Number(b.margin_pct))||a.site_key.localeCompare(b.site_key)||a.job_number.localeCompare(b.job_number));
}
function badge(r){
 if(r.margin_pct===null)return '<span class="pr-badge pr-red">Check value</span>';
 const m=Number(r.margin_pct),cls=m<0?'pr-red':m<=45?(r.job_type==='tyre_only'?'pr-blue':'pr-amber'):'pr-green';
 return '<span class="pr-badge '+cls+'">'+m.toFixed(2)+'%</span>';
}
function row(r){
 const kind=r.job_type==='tyre_only'?'Tyre-only':r.job_type==='mixed'?'Tyres + other work':'Non-tyre job';
 return '<article class="pr-job"><div class="pr-job-head"><div><b>'+E(sites[r.site_key])+'</b><div class="pr-muted">Job '+E(r.job_number)+'</div></div>'+badge(r)+'</div>'+
 '<div class="pr-type">'+E(kind)+(Number(r.profit)<0?' · <b>Loss-making</b>':'')+'</div>'+
 '<div class="pr-amounts"><span>Sale<strong>'+money(r.sales)+'</strong></span><span>Cost<strong>'+money(r.cost)+'</strong></span><span>Gross profit<strong>'+money(r.profit)+'</strong></span></div>'+
 '<div class="pr-muted" style="margin-top:12px;overflow-wrap:anywhere;">Invoice '+E(r.invoice_numbers)+'</div>'+invoiceButtons(r)+'</article>';
}
function invoiceButtons(r){
 const docs=P.invoices.filter(d=>d.site_key===r.site_key&&d.report_date===r.report_date&&d.job_number===r.job_number);
 const numbers=String(r.invoice_numbers).split(',').map(n=>n.trim());
 if(!low(r)&&r.margin_pct!==null&&!docs.length)return '';
 return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'+numbers.map(n=>{
  const doc=docs.find(d=>d.invoice_number===n);
  return doc?'<button type="button" class="add-btn" data-profit-invoice="'+E(doc.site_key+'|'+doc.report_date+'|'+doc.invoice_number)+'">View invoice'+(numbers.length>1?' '+E(n):'')+'</button>':'<span class="pr-muted">Invoice '+E(n)+' pending collection</span>';
 }).join('')+'</div>';
}
async function openInvoice(key,button){
 const doc=P.invoices.find(d=>d.site_key+'|'+d.report_date+'|'+d.invoice_number===key);
 if(!doc||!allowed()||P.loaded!==queryKey())return;
 const identity=owner(),tab=window.open('about:blank','_blank');
 button.disabled=true;const label=button.textContent;button.textContent='Opening…';
 try{
  const headers=await authHeaders();delete headers['Content-Type'];
  const path=doc.storage_path.split('/').map(encodeURIComponent).join('/');
  const res=await fetch(SUPABASE_URL+'/storage/v1/object/authenticated/job-invoices/'+path,{headers,cache:'no-store'});
  if(!res.ok)throw Error('Invoice could not be opened (HTTP '+res.status+'). Please refresh and try again.');
  const blob=await res.blob();
  if(!allowed()||owner()!==identity)throw Error('Please sign in again to view this invoice.');
  const url=URL.createObjectURL(blob);
  if(tab)tab.location.href=url;
  else{const a=document.createElement('a');a.href=url;a.download=doc.invoice_number+'.pdf';a.click();}
  setTimeout(()=>URL.revokeObjectURL(url),120000);
 }catch(e){if(tab)tab.close();window.alert(e.message||'Could not open invoice');}
 finally{button.disabled=false;button.textContent=label;}
}
function coverage(){
 return Object.entries(sites).filter(([k])=>site()==='all'||k===site()).map(([k,name])=>{
  const r=P.reports.find(r=>r.site_key===k),s=P.statuses.find(r=>r.site_key===k);
  const text=r?.source_kind==='autowork'?(s?.status==='failed'?'Earlier data · retry failed':Number(r.total_jobs)+' jobs · direct'):r?'Email · margins pending':s?.status==='failed'?'Import needs retry':'Awaiting report';
  const cls=r?.source_kind==='autowork'&&s?.status!=='failed'?'pr-green':'pr-amber';
  const time=r?.collected_at?new Date(r.collected_at).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}):'';
  return '<div class="pr-coverage"><b>'+E(name)+'</b><span class="'+cls+'">'+E(text)+'</span>'+(time?'<small class="pr-muted">Collected '+time+'</small>':'')+'</div>';
 }).join('');
}
const button=(id,text)=>'<button class="add-btn" type="button" data-profit-action="'+id+'">'+text+'</button>';
function metric(value,title,cls=''){return '<div class="pr-metric"><strong class="'+cls+'">'+value+'</strong><span>'+title+'</span></div>';}
function display(){
 if(!allowed())return '<div class="card">Sign in through Management to view job margins.</div>';
 if(P.owner!==owner()){P.owner=owner();P.loaded='';P.rows=[];P.reports=[];P.statuses=[];P.invoices=[];P.error='';P.site='all';}
 const tabs='<div class="pr-tabs">'+button('margins','Low-margin jobs')+button('totals','Job totals & history')+'</div>';
 if(P.view==='totals')return styles()+tabs+original();
 if(P.loaded!==queryKey()&&!P.loading)setTimeout(()=>load(),0);
 const valid=P.loaded===queryKey()&&!P.loading&&!P.error,rows=valid?P.rows:[],reports=valid?P.reports:[];
 const direct=reports.filter(r=>r.source_kind==='autowork'),expected=site()==='all'?8:1;
 const lows=rows.filter(low),tyres=lows.filter(r=>r.job_type==='tyre_only');
 const shown=valid?selected():[];
 return styles()+tabs+'<section class="pr-root"><div class="pr-top"><div><h2>Job margin review</h2><div class="pr-muted">Daily Profit Tracker · '+E(dateLabel(P.date))+'</div></div><div class="pr-actions">'+button('refresh','Refresh')+button('print','Print / Save PDF')+button('csv','Export CSV')+'</div></div>'+
 '<div class="card pr-controls"><label>Report date<input type="date" data-profit-filter="date" value="'+E(P.date)+'"></label><label>Workshop<select data-profit-filter="site">'+(group()?'<option value="all">All workshops</option>':'')+Object.entries(sites).filter(([k])=>group()||k===site()).map(([k,v])=>'<option value="'+k+'"'+(site()===k?' selected':'')+'>'+E(v)+'</option>').join('')+'</select></label><label>Show<select data-profit-filter="filter">'+[['low','All jobs at 45% or below'],['review','Non-tyre / mixed jobs ≤45%'],['tyres','Tyre-only jobs ≤45%'],['checks','Zero / negative sale checks'],['all','All invoiced jobs']].map(([k,v])=>'<option value="'+k+'"'+(P.filter===k?' selected':'')+'>'+E(v)+'</option>').join('')+'</select></label></div>'+
 '<div class="pr-metrics">'+metric(valid?lows.length-tyres.length:'—','Non-tyre / mixed jobs ≤45%','pr-amber')+metric(valid?tyres.length:'—','Tyre-only jobs ≤45%','pr-blue')+metric(valid?rows.filter(r=>Number(r.profit)<0).length:'—','Loss-making jobs','pr-red')+metric(valid?direct.length+' / '+expected:'—','Workshops collected directly')+'</div>'+
 '<div class="card pr-note"><b>Review threshold: 45% or below.</b> Tyre-only jobs are labelled separately; mixed jobs remain in the main review. Margin = gross profit ÷ sale, excluding VAT. Autowork costs may exclude workshop wages and overheads, so this is not net profit. Zero or negative sales appear under value checks. Original invoice PDFs are collected for flagged jobs; pending invoices will appear after a successful collection.</div>'+
 ((P.loading||!valid)&&!P.error?'<div class="card" role="status">Loading daily jobs and margins…</div>':'')+
 (P.error?'<div class="card pr-red" role="alert">'+E(P.error)+' Use Refresh to retry.</div>':'')+
 (valid&&!P.error?'<div class="pr-coverage-grid">'+coverage()+'</div>':'')+
 (valid&&direct.length<expected?'<div class="card pr-note"><b>Coverage is incomplete.</b> '+direct.length+' of '+expected+' workshops have direct margin data. Missing reports are not zero jobs. Email counts remain available in Job totals & history.</div>':'')+
 (valid&&!P.error?'<div class="pr-list-head"><b>'+shown.length+' '+(P.filter==='all'?'invoiced jobs':'jobs in this view')+'</b><span class="pr-muted">Lowest margin first · all values exclude VAT</span></div><div class="pr-grid">'+(shown.length?shown.map(row).join(''):'<div class="card">'+(direct.length?'No jobs match this filter in the available reports.':'No direct margin reports available for this date yet.')+'</div>')+'</div><div class="pr-muted" style="margin-top:16px;">'+reports.reduce((n,r)=>n+Number(r.credit_notes||0),0)+' credit notes are included in report sales reconciliation, but excluded from invoiced-job margins. These are invoice-day figures, not lifetime job profitability.</div>':'')+'</section>';
}
function styles(){return '<style>.pr-tabs,.pr-actions,.pr-top,.pr-controls,.pr-list-head{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pr-tabs{margin:0 0 18px}.pr-top,.pr-list-head{justify-content:space-between}.pr-top h2{margin:0 0 5px}.pr-controls{margin:18px 0;align-items:end}.pr-controls label{display:flex;flex-direction:column;gap:7px;font-size:12px;flex:1;min-width:150px}.pr-controls input,.pr-controls select{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:11px;max-width:100%;width:100%;box-sizing:border-box}.pr-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.pr-metric,.pr-job,.pr-coverage{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:16px}.pr-metric strong{display:block;font-size:30px;margin-bottom:8px}.pr-metric span,.pr-muted{font-size:12px;color:var(--muted)}.pr-note{font-size:12px;line-height:1.65;margin:15px 0}.pr-coverage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin:15px 0}.pr-coverage{padding:12px;display:flex;flex-direction:column;gap:6px;font-size:12px}.pr-list-head{margin:22px 0 12px}.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px}.pr-job-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.pr-job-head .pr-muted{margin-top:6px}.pr-badge{padding:7px 10px;border-radius:9px;background:var(--bg);font-weight:800;font-size:22px;white-space:nowrap}.pr-amber{color:#d89b25}.pr-blue{color:#589de7}.pr-red{color:#ef6464}.pr-green{color:#49ad82}.pr-type{font-size:12px;margin:14px 0;color:var(--muted)}.pr-amounts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:13px;border-top:1px solid var(--line)}.pr-amounts span{font-size:11px;color:var(--muted)}.pr-amounts strong{display:block;font-size:15px;color:var(--text);margin-top:6px}@media(max-width:520px){.pr-actions .add-btn{font-size:11px}.pr-controls label{min-width:100%}.pr-metrics{grid-template-columns:1fr 1fr}.pr-metric{padding:12px}.pr-metric strong{font-size:26px}}</style>';}
function exportCsv(){
 if(P.loaded!==queryKey()||P.error||P.loading)return;
 const rows=[['Date','Workshop','Job','Invoices','Job type','Sale ex VAT','Cost ex VAT','Gross profit','Margin %'],...selected().map(r=>[r.report_date,sites[r.site_key],r.job_number,r.invoice_numbers,r.job_type,r.sales,r.cost,r.profit,r.margin_pct??'Check value'])];
 const csv=rows.map(row=>row.map(x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'").replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='NEAS-Job-Margins-'+P.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function print(){
 if(P.loaded!==queryKey()||P.error||P.loading)return;
 const win=window.open('','_blank');if(!win)return;
 const direct=P.reports.filter(r=>r.source_kind==='autowork').length;
 win.document.write('<!doctype html><html><head><title>NEAS job margins '+E(P.date)+'</title><style>body{font:12px Arial;margin:25px}table{width:100%;border-collapse:collapse}td,th{padding:9px;text-align:left;border-bottom:1px solid #ccc}h1{font-size:23px}p{line-height:1.5}@media print{button{display:none}tr{break-inside:avoid}}</style></head><body><h1>North East Auto Services · Job margins</h1><p>'+E(dateLabel(P.date))+' · '+E(site()==='all'?'All workshops':sites[site()])+' · '+direct+' direct reports. Filter: '+E(P.filter)+'.<br>Review threshold ≤45%. Tyre-only jobs labelled separately. Margin excludes VAT and may exclude wages/overheads. Missing reports are not zero.</p><button onclick="window.print()">Print / Save PDF</button><table><thead><tr><th>Workshop / job</th><th>Invoice</th><th>Type</th><th>Sale</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead><tbody>'+selected().map(r=>'<tr><td>'+E(sites[r.site_key])+'<br>'+E(r.job_number)+'</td><td>'+E(r.invoice_numbers)+'</td><td>'+E(r.job_type==='tyre_only'?'Tyre-only':r.job_type==='mixed'?'Mixed':'Non-tyre')+'</td><td>'+money(r.sales)+'</td><td>'+money(r.cost)+'</td><td>'+money(r.profit)+'</td><td>'+(r.margin_pct===null?'Check':Number(r.margin_pct).toFixed(2)+'%')+'</td></tr>').join('')+'</tbody></table></body></html>');win.document.close();
}
document.addEventListener('click',e=>{
 const invoice=e.target.closest?.('[data-profit-invoice]');
 if(invoice&&allowed()&&state.admin.tab==='jobs'){openInvoice(invoice.dataset.profitInvoice,invoice);return;}
 const el=e.target.closest?.('[data-profit-action]');if(!el||!allowed()||state.admin.tab!=='jobs')return;
 const action=el.dataset.profitAction;
 if(action==='totals'||action==='margins'){P.view=action;redraw();}
 if(action==='refresh'){load(true);redraw();}
 if(action==='csv')exportCsv();if(action==='print')print();
});
document.addEventListener('change',e=>{
 const el=e.target.closest?.('[data-profit-filter]');if(!el||!allowed()||state.admin.tab!=='jobs')return;
 const k=el.dataset.profitFilter;
 if(k==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(el.value))P.date=el.value;
 if(k==='site'&&group()&&(el.value==='all'||sites[el.value]))P.site=el.value;
 if(k==='filter'&&['low','review','tyres','checks','all'].includes(el.value))P.filter=el.value;
 redraw();
});
J.render=display;
})();
