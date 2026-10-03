(function(){
'use strict';
const R=window.NEASFullReport;if(!R)return;

R.issues=function(s,p){
 const a=[];
 (s.hsIssues||[]).forEach(x=>a.push(['Monthly H&S',x]));
 if(s.workshop&&s.hs&&s.hs.status==='published'&&s.acked<s.expected)a.push(['H&S acknowledgement',(s.expected-s.acked)+' staff outstanding']);
 if(s.workshop&&!s.hs&&['mtd','month'].includes(p.mode))a.push(['Monthly H&S','No report saved for '+R.ml(p.month)]);
 if(s.workshop&&s.mot&&!s.mot.completed)a.push(['MOT QC','Monthly MOT QC is not complete']);
 if(s.workshop&&!s.mot&&['mtd','month'].includes(p.mode))a.push(['MOT QC','No monthly MOT QC record saved']);
 if(s.mot&&String(s.mot.issues_found||'').trim())a.push(['MOT QC',String(s.mot.issues_found).trim()]);
 if(s.auto)a.push(['Attendance',s.auto+' automatic clock-out'+(s.auto===1?'':'s')+' to review']);
 if(s.pending)a.push(['Holiday',R.dec(s.pending,2)+' pending holiday day'+(s.pending===1?'':'s')]);
 (s.weekly||[]).forEach(w=>{
  if(!R.weekDone(w))a.push(['Weekly checks',R.fmt(w.week_start)+' — checks incomplete']);
  if(String(w.maintenance_status||'OK').toUpperCase()!=='OK')a.push(['Weekly checks',R.fmt(w.week_start)+' — maintenance: '+w.maintenance_status]);
  if(w.vehicles_left_status&&String(w.vehicles_left_status).toLowerCase()!=='no vehicles left on site')a.push(['Weekly checks',R.fmt(w.week_start)+' — vehicles left: '+w.vehicles_left_status]);
  if(String(w.notes||'').trim())a.push(['Weekly checks',R.fmt(w.week_start)+' — '+String(w.notes).trim()]);
 });
 return a;
};
R.done=function(s,p){
 const ok=[],no=[];
 if(s.workshop){
  if(s.target>0)ok.push('Target set for selected period');else if(['mtd','month'].includes(p.mode))no.push('Target sheet not set');
  if(p.mode!=='day'){
   if(s.weekly.length&&s.weeklyDone===s.weekly.length)ok.push('Weekly checks complete ('+s.weeklyDone+'/'+s.weekly.length+')');
   else if(s.weekly.length)no.push('Weekly checks incomplete ('+s.weeklyDone+'/'+s.weekly.length+')');
   else no.push('No weekly check record in this period');
  }
  if(s.hs){
   if(s.hs.status==='published')ok.push('Monthly H&S published');else no.push('Monthly H&S still '+String(s.hs.status||'draft'));
   if(s.expected&&s.acked>=s.expected)ok.push('All H&S acknowledgements complete');
   else if(s.hs.status==='published')no.push(Math.max(0,s.expected-s.acked)+' H&S acknowledgement'+(s.expected-s.acked===1?'':'s')+' outstanding');
  }else if(['mtd','month'].includes(p.mode))no.push('Monthly H&S not completed');
  if(s.mot){if(s.mot.completed)ok.push('MOT QC complete');else no.push('MOT QC outstanding')}
  else if(['mtd','month'].includes(p.mode))no.push('MOT QC not completed');
 }
 if(s.stockDate)ok.push('Stock value captured '+R.fmt(s.stockDate));
 if(!s.auto)ok.push('No automatic clock-outs in the selected period');else no.push(s.auto+' automatic clock-out'+(s.auto===1?'':'s')+' to check');
 return{ok,no};
};
R.summary=function(ss,p){
 const good=[],bad=[],facts=[],targets=ss.filter(s=>s.workshop&&s.target>0),hit=targets.filter(s=>s.sales>=s.target),comp=ss.filter(s=>s.compare>0),ahead=comp.filter(s=>s.sales>=s.compare);
 if(targets.length)good.push(hit.length+' of '+targets.length+' workshop site'+(targets.length===1?' is':'s are')+' at or above the selected-period target.');
 if(comp.length)good.push(ahead.length+' of '+comp.length+' site'+(comp.length===1?' is':'s are')+' ahead of the available comparison sales figure.');
 const due=ss.reduce((n,s)=>n+s.weekly.length,0),done=ss.reduce((n,s)=>n+s.weeklyDone,0);if(due)good.push(done+' of '+due+' weekly site-check report'+(due===1?' is':'s are')+' complete.');
 const ex=ss.reduce((n,s)=>n+s.expected,0),ack=ss.reduce((n,s)=>n+s.acked,0);if(ex)good.push(ack+' of '+ex+' required Monthly H&S acknowledgements are recorded.');
 const below=targets.filter(s=>s.sales<s.target);if(below.length)bad.push('Below period target: '+below.map(s=>s.name+' ('+R.money(s.sales)+' vs '+R.money(s.target)+')').join(', ')+'.');
 const wi=ss.filter(s=>s.weekly.length&&s.weeklyDone<s.weekly.length);if(wi.length)bad.push('Weekly checks incomplete: '+wi.map(s=>s.name+' '+s.weeklyDone+'/'+s.weekly.length).join(', ')+'.');
 const ha=ss.filter(s=>s.hs&&s.hs.status==='published'&&s.acked<s.expected);if(ha.length)bad.push('H&S acknowledgements outstanding: '+ha.map(s=>s.name+' '+s.acked+'/'+s.expected).join(', ')+'.');
 const ic=ss.reduce((n,s)=>n+R.issues(s,p).length,0);if(ic)bad.push(ic+' recorded operational/compliance item'+(ic===1?' needs':'s need')+' review.');
 const satSites=ss.filter(s=>s.workshop&&s.saturday&&s.saturday.count>0&&s.saturday.target>0);
 const satOnTarget=satSites.filter(s=>s.saturday.sales>=s.saturday.target);
 if(satSites.length)good.push('Saturday target: '+satOnTarget.length+' of '+satSites.length+' workshop site'+(satSites.length===1?' is':'s are')+' at or above target in this period.');
 const satBelow=satSites.filter(s=>s.saturday.sales<s.saturday.target);
 if(satBelow.length)bad.push('Saturday below target: '+satBelow.map(s=>s.name+' ('+R.money(s.saturday.sales)+' vs '+R.money(s.saturday.target)+')').join(', ')+'.');
 if(satSites.length){
  facts.push('Saturday sales: '+R.money(satSites.reduce((n,s)=>n+s.saturday.sales,0))+' against '+R.money(satSites.reduce((n,s)=>n+s.saturday.target,0))+' target.');
  facts.push('Saturday direct wages recorded: '+R.money(satSites.reduce((n,s)=>n+s.saturday.wages,0))+'.');
  const missing=satSites.reduce((n,s)=>n+s.saturday.missingRates,0),after=satSites.reduce((n,s)=>n+s.saturday.afterWages,0);
  facts.push('Estimated Saturday contribution after direct wages: '+(missing?'at most ':'')+R.money(after)+(missing?' because '+missing+' pay rate'+(missing===1?' is':'s are')+' missing.':'.'));
 }
 facts.push('Recorded staff hours: '+R.dec(ss.reduce((n,s)=>n+s.hours,0),2)+'.');
 facts.push('Sick workdays recorded: '+ss.reduce((n,s)=>n+s.sick,0)+'.');
 facts.push('Approved holiday days recorded: '+R.dec(ss.reduce((n,s)=>n+s.holiday,0),2)+'.');
 facts.push('Sales recorded: '+R.money(ss.reduce((n,s)=>n+s.sales,0))+'.');
 facts.push('Target for covered workshop sites: '+R.money(ss.reduce((n,s)=>n+s.target,0))+'.');
 facts.push('Latest stock value shown: '+R.money(ss.reduce((n,s)=>n+s.stock,0))+'.');
 if(!good.length)good.push('No positive completion statement is available yet for this period.');
 if(!bad.length)bad.push('No saved operational or compliance items are currently flagged for attention.');
 return{good,bad,facts};
};
const list=a=>'<ul style="margin:7px 0 0;padding-left:18px;line-height:1.55;">'+a.map(x=>'<li>'+R.e(x)+'</li>').join('')+'</ul>';
const rows=a=>a.map(x=>'<tr><td><b>'+R.e(x[0])+'</b></td><td>'+R.e(x[1])+'</td>'+(x.length>2?'<td>'+R.e(x[2])+'</td>':'')+'</tr>').join('');

R.finishedOptions=function(){
 const o=['<option value="">Finished reports / periods…</option>'],t=R.fd(R.today());
 for(let i=1;i<=14;i++){const d=new Date(t);d.setDate(d.getDate()-i);o.push('<option value="day|'+R.iso(d)+'">Daily · '+R.fmt(R.iso(d))+'</option>')}
 let sat=R.today(),sd=R.fd(sat),diff=(sd.getDay()+1)%7;sat=R.add(sat,-diff);for(let i=0;i<12;i++){const d=R.add(sat,-7*i);o.push('<option value="saturday|'+d+'">Saturday · '+R.fmt(d)+'</option>')}
 let w=R.add(R.mon(R.today()),-7);for(let i=0;i<8;i++){const a=R.add(w,-7*i);o.push('<option value="week|'+R.add(a,6)+'">Week · '+R.fmt(a)+' to '+R.fmt(R.add(a,6))+'</option>')}
 const cm=R.today().slice(0,7).split('-').map(Number);for(let i=1;i<=12;i++){const d=new Date(cm[0],cm[1]-1-i,1,12),m=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');o.push('<option value="saturdays|'+m+'">All Saturdays · '+R.ml(m)+'</option>');o.push('<option value="month|'+m+'">Monthly · '+R.ml(m)+'</option>')}
 return o.join('');
};

R.saturdayHtml=function(ss,p,selected){
 const rows=ss.filter(s=>s.saturday&&s.saturday.count>0);
 const title=p.mode==='saturdays'?'All Saturdays · '+R.ml(p.month):'Saturday performance';
 if(!rows.length)return '<details class="card"><summary style="cursor:pointer;font-weight:800;">'+title+'</summary><div style="margin-top:12px;color:var(--muted);">No Saturday data falls inside this reporting period.</div></details>';
 const totals=rows.reduce((a,s)=>{const q=s.saturday||{};a.count+=R.n(q.count);a.sales+=R.n(q.sales);a.target+=R.n(q.target);a.wages+=R.n(q.wages);a.after+=R.n(q.afterWages);a.missing+=R.n(q.missingRates);return a},{count:0,sales:0,target:0,wages:0,after:0,missing:0});
 const variance=totals.sales-totals.target;
 const kpis='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px;margin:12px 0;">'
  +'<div style="padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Saturday sales</small><div class="mono" style="font-size:20px;font-weight:800;margin-top:3px;">'+R.money(totals.sales)+'</div></div>'
  +'<div style="padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Saturday target</small><div class="mono" style="font-size:20px;font-weight:800;margin-top:3px;">'+R.money(totals.target)+'</div></div>'
  +'<div style="padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Variance</small><div class="mono" style="font-size:20px;font-weight:800;margin-top:3px;color:'+(totals.target?(variance<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(totals.target?((variance>=0?'+':'')+R.money(variance)):'—')+'</div></div>'
  +'<div style="padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Direct wages</small><div class="mono" style="font-size:20px;font-weight:800;margin-top:3px;">'+R.money(totals.wages)+'</div></div>'
  +'<div style="padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Est. after wages</small><div class="mono" style="font-size:20px;font-weight:800;margin-top:3px;color:'+(totals.missing?'var(--amber)':totals.after<0?'var(--red)':'var(--green)')+';">'+(totals.missing?'≤ ':'')+R.money(totals.after)+'</div></div>'
  +'</div>';
 const body=rows.map(s=>{
  const q=s.saturday||{},att=q.target>0?(q.sales/q.target*100):null,weekdayAtt=q.weekdayTarget>0?(q.weekdaySales/q.weekdayTarget*100):null;
  const contrib=q.missingRates>0?'≤ '+R.money(q.afterWages):R.money(q.afterWages);
  return '<tr><td><b>'+R.e(s.name)+'</b></td><td>'+q.count+'</td><td>'+R.money(q.sales)+'</td><td>'+(q.target?R.money(q.target):'—')+'</td><td style="font-weight:800;color:'+(q.target?(q.variance<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(q.target?(q.variance>=0?'+':'')+R.money(q.variance):'—')+'</td><td>'+(att==null?'—':att.toFixed(1)+'%')+'</td><td>'+R.money(q.wages)+'</td><td>'+R.money(q.grossEstimate)+'</td><td style="font-weight:800;color:'+(q.missingRates>0?'var(--amber)':q.afterWages<0?'var(--red)':'var(--green)')+';">'+contrib+(q.missingRates>0?' *':'')+'</td><td>'+R.dec(q.hours,2)+'</td><td>'+q.staffShifts+'</td><td>'+q.auto+'</td><td>'+(weekdayAtt==null?'—':weekdayAtt.toFixed(1)+'%')+'</td></tr>';
 }).join('');
 let detail='';
 if(selected&&selected.saturday&&selected.saturday.detail&&selected.saturday.detail.length){
  detail='<details style="margin-top:12px;"><summary style="cursor:pointer;font-weight:800;">Saturday-by-Saturday detail · '+R.e(selected.name)+'</summary><div style="overflow:auto;margin-top:10px;"><table><thead><tr><th>Saturday</th><th>Sales</th><th>Target</th><th>Variance</th><th>% target</th><th>Direct wages</th><th>Est. gross profit</th><th>Est. after wages</th><th>Staff working</th><th>Staff hours</th><th>Auto-close</th></tr></thead><tbody>'+selected.saturday.detail.map(x=>{const a=x.target>0?x.sales/x.target*100:null;const contrib=x.missingRates>0?'≤ '+R.money(x.afterWages):R.money(x.afterWages);return '<tr><td>'+R.fmt(x.date)+'</td><td>'+R.money(x.sales)+'</td><td>'+(x.target?R.money(x.target):'—')+'</td><td style="font-weight:700;color:'+(x.target?(x.variance<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(x.target?(x.variance>=0?'+':'')+R.money(x.variance):'—')+'</td><td>'+(a==null?'—':a.toFixed(1)+'%')+'</td><td>'+R.money(x.wages)+'</td><td>'+R.money(x.grossEstimate)+'</td><td style="font-weight:800;color:'+(x.missingRates>0?'var(--amber)':x.afterWages<0?'var(--red)':'var(--green)')+';">'+contrib+(x.missingRates>0?' *':'')+'</td><td>'+x.staff+'</td><td>'+R.dec(x.hours,2)+'</td><td>'+x.auto+'</td></tr>'}).join('')+'</tbody></table></div></details>';
 }
 const note='<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:11px;color:var(--muted);">How the Saturday figures are calculated</summary><div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:7px;">Direct wages use recorded paid hours × saved pay rate. ETAC Petrol staff remain separate from ETAC Workshop. Estimated gross profit uses the recorded margin percentage; estimated after wages is gross profit less direct wages, so it is a contribution estimate rather than final net profit. * means one or more pay rates are missing. Weekday % target is context only.</div></details>';
 return '<details class="card" open><summary style="cursor:pointer;font-weight:800;">'+title+' · '+totals.count+' site-Saturday'+(totals.count===1?'':'s')+'</summary>'+kpis+'<div style="overflow:auto;"><table style="min-width:1250px;"><thead><tr><th>Site</th><th>Saturdays</th><th>Sat sales</th><th>Sat target</th><th>Variance</th><th>% target</th><th>Direct wages</th><th>Est. gross profit</th><th>Est. after wages</th><th>Staff hours</th><th>Staff attendances</th><th>Auto-close</th><th>Weekday % target</th></tr></thead><tbody>'+body+'</tbody></table></div>'+detail+note+'</details>';
};

R.staffSiteHtml=function(sites){
 const list=(sites||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 if(!list.length)return'';
 const inner=list.map(s=>{
  const missing=s.people.filter(x=>x.payRate==null).length,worked=s.people.filter(x=>x.hours>0).length;
  const meta='<span style="font-weight:500;color:var(--muted);margin-left:8px;">'+s.people.length+' staff · '+worked+' worked'+(missing?' · '+missing+' pay rate'+(missing===1?'':'s')+' missing':'')+'</span>';
  const table='<div style="margin-top:10px;overflow:auto;"><table style="min-width:1050px;"><thead><tr><th>Employee</th><th>Hours</th><th>Worked days</th><th>Sick</th><th>Holiday</th><th>Bradford</th><th>Auto-close</th><th>Manual edits</th><th>Month bonus</th><th>Pay rate</th><th>Hours × rate</th></tr></thead><tbody>'+s.people.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(x=>'<tr><td><b>'+R.e(x.name)+'</b></td><td>'+R.dec(x.hours,2)+'</td><td>'+x.worked+'</td><td>'+x.sick+'</td><td>'+R.dec(x.holiday,2)+'</td><td>'+x.bradford+'</td><td>'+x.auto+'</td><td>'+x.manual+'</td><td>'+R.money(x.bonus)+'</td><td>'+(x.payRate==null?'<span style="color:var(--amber);font-weight:700;">Missing</span>':R.money(x.payRate))+'</td><td>'+(x.payRef==null?'—':R.money(x.payRef))+'</td></tr>').join('')+'</tbody></table></div>';
  return '<details style="border-top:1px solid var(--line);padding:11px 0;"><summary style="cursor:pointer;font-weight:800;">'+R.e(s.name)+meta+'</summary>'+table+'</details>';
 }).join('');
 return '<details class="card"><summary style="cursor:pointer;font-weight:800;">Employees by site · '+list.reduce((n,s)=>n+s.people.length,0)+' staff</summary><div style="font-size:11px;color:var(--muted);margin:9px 0 2px;">Open a workshop to view its employee attendance, Bradford, bonus and pay-rate detail.</div>'+inner+'</details>';
};

R.view=function(m){
 const sid=state.admin.reportPeriodSite||'all',sel=sid==='all'?null:m.sites.find(s=>s.id===sid),ss=sel?[sel]:m.sites,sm=R.summary(ss,m.p),issues=ss.flatMap(s=>R.issues(s,m.p).map(x=>[s.name,x[0],x[1]])),OK=[],NO=[];
 ss.forEach(s=>{const d=R.done(s,m.p);d.ok.forEach(x=>OK.push([s.name,x]));d.no.forEach(x=>NO.push([s.name,x]))});
 const sales=ss.reduce((n,s)=>n+s.sales,0),target=ss.reduce((n,s)=>n+s.target,0),variance=sales-target,scope=sid==='all'?'All workshops':(sel?sel.name:'Selected workshop');
 const cmp='<div style="overflow:auto;"><table style="min-width:1250px;"><thead><tr><th>Workshop</th><th>Staff</th><th>Hours</th><th>Sick</th><th>Holiday</th><th>Sales</th><th>Target</th><th>Variance</th><th>Margin</th><th>Stock</th><th>Vs comparison</th><th>Weekly</th><th>H&S</th><th>Issues</th></tr></thead><tbody>'+ss.map(s=>{const v=s.sales-s.target,c=s.compare?((s.sales-s.compare)/Math.abs(s.compare))*100:null,ic=R.issues(s,m.p).length;return'<tr><td><b>'+R.e(s.name)+'</b></td><td>'+s.head+'</td><td>'+R.dec(s.hours,2)+'</td><td>'+s.sick+'</td><td>'+R.dec(s.holiday,2)+'</td><td><b>'+R.money(s.sales)+'</b></td><td>'+(s.target?R.money(s.target):'—')+'</td><td style="font-weight:800;color:'+(s.target?(v<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(s.target?(v>=0?'+':'')+R.money(v):'—')+'</td><td>'+R.pct(s.margin)+'</td><td>'+R.money(s.stock)+'</td><td style="font-weight:700;color:'+(c==null?'var(--muted)':c<0?'var(--red)':'var(--green)')+';">'+(c==null?'—':(c>=0?'+':'')+c.toFixed(1)+'%')+'</td><td>'+(s.weekly.length?s.weeklyDone+'/'+s.weekly.length:'—')+'</td><td>'+(s.hs?s.acked+'/'+s.expected:'—')+'</td><td>'+(ic?'<b style="color:var(--red);">'+ic+'</b>':'<span style="color:var(--green);font-weight:700;">0</span>')+'</td></tr>'}).join('')+'</tbody></table></div>';
 const actionKpis='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0 12px;"><div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Needs attention</small><div class="mono" style="font-size:20px;font-weight:800;color:'+(NO.length?'var(--red)':'var(--green)')+';">'+NO.length+'</div></div><div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Recorded issues</small><div class="mono" style="font-size:20px;font-weight:800;color:'+(issues.length?'var(--amber)':'var(--green)')+';">'+issues.length+'</div></div><div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);"><small style="color:var(--muted);">Completed</small><div class="mono" style="font-size:20px;font-weight:800;color:var(--green);">'+OK.length+'</div></div></div>';
 const actions='<details class="card" open><summary style="cursor:pointer;font-weight:800;">Actions & compliance</summary>'+actionKpis
  +'<details '+(NO.length?'open':'')+' style="border-top:1px solid var(--line);padding:10px 0;"><summary style="cursor:pointer;font-weight:800;color:'+(NO.length?'var(--red)':'var(--green)')+';">Needs attention · '+NO.length+'</summary><div style="margin-top:10px;">'+(NO.length?'<table><thead><tr><th>Workshop</th><th>Outstanding</th></tr></thead><tbody>'+rows(NO)+'</tbody></table>':'<b style="color:var(--green);">Nothing outstanding in this section.</b>')+'</div></details>'
  +'<details '+(issues.length?'open':'')+' style="border-top:1px solid var(--line);padding:10px 0;"><summary style="cursor:pointer;font-weight:800;">Recorded issues / actions · '+issues.length+'</summary><div style="margin-top:10px;">'+(issues.length?'<table><thead><tr><th>Workshop</th><th>Area</th><th>Issue / action</th></tr></thead><tbody>'+rows(issues)+'</tbody></table>':'<b style="color:var(--green);">No saved issues found.</b>')+'</div></details>'
  +'<details style="border-top:1px solid var(--line);padding:10px 0;"><summary style="cursor:pointer;font-weight:800;color:var(--green);">Completed · '+OK.length+'</summary><div style="margin-top:10px;">'+(OK.length?'<table><thead><tr><th>Workshop</th><th>Completed</th></tr></thead><tbody>'+rows(OK)+'</tbody></table>':'None recorded yet.')+'</div></details></details>';
 return'<div class="card" style="border-left:4px solid var(--amber);padding:14px 16px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Management report</div><div style="font-size:18px;font-weight:800;margin-top:2px;">'+R.e(m.p.label)+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px;">'+R.e(scope)+' · operational data through '+R.fmt(m.p.end)+'</div></div><div style="font-size:11px;color:var(--muted);">Monthly H&S and MOT QC: '+R.ml(m.p.month)+'</div></div></div>'
 +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin-bottom:14px;"><div class="card" style="margin:0;padding:12px;"><small style="color:var(--muted);">Workshops</small><div class="mono" style="font-size:23px;font-weight:800;margin-top:3px;">'+ss.length+'</div></div><div class="card" style="margin:0;padding:12px;"><small style="color:var(--muted);">Sales</small><div class="mono" style="font-size:23px;font-weight:800;margin-top:3px;">'+R.money(sales)+'</div></div><div class="card" style="margin:0;padding:12px;"><small style="color:var(--muted);">Target</small><div class="mono" style="font-size:23px;font-weight:800;margin-top:3px;">'+R.money(target)+'</div></div><div class="card" style="margin:0;padding:12px;"><small style="color:var(--muted);">Variance</small><div class="mono" style="font-size:23px;font-weight:800;margin-top:3px;color:'+(target?(variance<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(target?(variance>=0?'+':'')+R.money(variance):'—')+'</div></div><div class="card" style="margin:0;padding:12px;"><small style="color:var(--muted);">Items to address</small><div class="mono" style="font-size:23px;font-weight:800;margin-top:3px;color:'+(NO.length||issues.length?'var(--red)':'var(--green)')+';">'+(NO.length+issues.length)+'</div></div></div>'
 +'<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><h3 style="margin:0;">Management summary</h3><span style="font-size:11px;color:var(--muted);">Operational and compliance facts only</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-top:12px;"><div style="padding:12px;border:1px solid var(--line);border-left:4px solid var(--green);border-radius:8px;background:var(--green-dim);"><b style="color:var(--green);">Going well</b>'+list(sm.good)+'</div><div style="padding:12px;border:1px solid var(--line);border-left:4px solid var(--red);border-radius:8px;"><b style="color:var(--red);">Needs attention</b>'+list(sm.bad)+'</div><div style="padding:12px;border:1px solid var(--line);border-left:4px solid var(--amber);border-radius:8px;background:var(--panel-2);"><b style="color:var(--amber);">Key facts</b>'+list(sm.facts)+'</div></div></div>'
 +R.saturdayHtml(ss,m.p,sel)
 +'<details class="card" open><summary style="cursor:pointer;font-weight:800;">'+(sid==='all'?'Workshop comparison':'Workshop overview · '+R.e(sel?sel.name:''))+'</summary><div style="font-size:11px;color:var(--muted);margin:9px 0 10px;">Sales, target, staffing and compliance in one comparison table.</div>'+cmp+'</details>'
 +actions
 +R.staffSiteHtml(ss);
};

R.panel=function(){
 R.init();const p=R.period(),sid=state.admin.reportPeriodSite||'all',key=[p.mode,p.start,p.end,p.month].join('|');if(R.cache.key!==key&&!R.cache.busy)setTimeout(()=>R.load(false),0);
 const modes=[['day','Daily'],['saturday','Saturday'],['saturdays','All Saturdays in month'],['week','Week'],['mtd','Month to date'],['month','Full month']].map(x=>'<option value="'+x[0]+'" '+(p.mode===x[0]?'selected':'')+'>'+x[1]+'</option>').join('');
 const so='<option value="all" '+(sid==='all'?'selected':'')+'>All workshops</option>'+R.sites().map(s=>'<option value="'+R.e(s.id)+'" '+(sid===String(s.id)?'selected':'')+'>'+R.e(s.name)+'</option>').join('');
 const when=(p.mode==='month'||p.mode==='saturdays')?'<label style="font-size:11px;color:var(--muted);">Month<input id="report-pro-month" type="month" value="'+R.e(state.admin.reportPeriodMonth)+'"></label>':'<label style="font-size:11px;color:var(--muted);">Reference date<input id="report-pro-date" type="date" max="'+R.today()+'" value="'+R.e(state.admin.reportPeriodDate)+'"></label>';
 let inner=R.cache.busy&&!R.cache.data?'<div class="card">Loading management report…</div>':R.cache.error?'<div class="card" style="color:var(--red);"><b>Report could not load</b><div style="margin-top:5px;">'+R.e(R.cache.error)+'</div></div>':R.cache.data?R.view(R.model()):'';
 let body='<div id="sales-analysis-output">'+inner+'</div>';
 return'<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;"><div><h2 style="margin-bottom:4px;">Full Management Report</h2><div style="font-size:12px;color:var(--muted);">Workshop performance, staffing and compliance in one report.</div></div></div><div class="card no-print" style="padding:12px 14px;"><div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Report controls</div><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;"><label style="font-size:11px;color:var(--muted);">Period<select id="report-pro-mode">'+modes+'</select></label>'+when+'<label style="font-size:11px;color:var(--muted);">Workshop<select id="report-pro-site" style="min-width:210px;">'+so+'</select></label><label style="font-size:11px;color:var(--muted);">Previous periods<select id="report-pro-finished" style="min-width:230px;">'+R.finishedOptions()+'</select></label><button type="button" class="add-btn" data-report-pro-refresh>Refresh</button><button type="button" class="add-btn" data-action="print-analysis" style="margin-left:auto;">🖶 Print report</button></div></div>'+body;
};

try{
 R.init();
 if(typeof renderAdmin==='function'){const old=renderAdmin;renderAdmin=function(){const h=old();if(!state.admin||state.admin.tab!=='fullreport')return h;const w=document.createElement('div');w.innerHTML=h;const m=w.querySelector('.admin-main');if(!m)return h;const top=m.querySelector('.admin-topbar');m.innerHTML=(top?top.outerHTML:'')+R.panel();return w.innerHTML}}
}catch(e){console.error('Full report professional UI failed',e)}

document.addEventListener('change',e=>{const t=e.target;if(!t||state.admin.tab!=='fullreport')return;
 if(t.id==='report-pro-mode'){state.admin.reportPeriodMode=t.value;R.cache={key:'',busy:false,error:'',data:null};render()}
 else if(t.id==='report-pro-date'){state.admin.reportPeriodDate=t.value||R.today();R.cache={key:'',busy:false,error:'',data:null};render()}
 else if(t.id==='report-pro-month'){state.admin.reportPeriodMonth=t.value||R.today().slice(0,7);R.cache={key:'',busy:false,error:'',data:null};render()}
 else if(t.id==='report-pro-site'){state.admin.reportPeriodSite=t.value||'all';render()}
 else if(t.id==='report-pro-finished'&&t.value){const a=t.value.split('|');state.admin.reportPeriodMode=a[0];if(a[0]==='month'||a[0]==='saturdays')state.admin.reportPeriodMonth=a[1];else state.admin.reportPeriodDate=a[1];R.cache={key:'',busy:false,error:'',data:null};render()}
},true);
document.addEventListener('click',e=>{const t=e.target&&e.target.closest&&e.target.closest('[data-report-pro-refresh]');if(t&&state.admin.tab==='fullreport'){e.preventDefault();R.load(true)}},true);
})();