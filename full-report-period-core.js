(function(){
'use strict';
const R=window.NEASFullReport=window.NEASFullReport||{};
R.cache={key:'',busy:false,error:'',data:null};
R.e=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
R.n=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
R.money=v=>'£'+R.n(v).toLocaleString('en-GB',{maximumFractionDigits:0});
R.dec=(v,d=0)=>R.n(v).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
R.pct=v=>Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'—';
R.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
R.today=()=>R.iso(new Date());
R.fd=s=>{const a=String(s).slice(0,10).split('-').map(Number);return new Date(a[0],a[1]-1,a[2],12)};
R.add=(s,n)=>{const d=R.fd(s);d.setDate(d.getDate()+n);return R.iso(d)};
R.mon=s=>{const d=R.fd(s),x=d.getDay();d.setDate(d.getDate()+(x===0?-6:1-x));return R.iso(d)};
R.ms=m=>String(m).slice(0,7)+'-01';
R.me=m=>{const a=String(m).slice(0,7).split('-').map(Number);return R.iso(new Date(a[0],a[1],0,12))};
R.fmt=s=>R.fd(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
R.ml=m=>new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
R.inr=(d,a,b)=>!!d&&String(d).slice(0,10)>=a&&String(d).slice(0,10)<=b;
R.allowedDate=(d,p)=>R.inr(d,p.start,p.end)&&(p.mode!=='saturdays'||R.fd(d).getDay()===6);

R.init=function(){
 if(!state.admin.reportPeriodMode)state.admin.reportPeriodMode='mtd';
 if(!state.admin.reportPeriodDate)state.admin.reportPeriodDate=R.today();
 if(!state.admin.reportPeriodMonth)state.admin.reportPeriodMonth=R.today().slice(0,7);
 if(!state.admin.reportPeriodSite)state.admin.reportPeriodSite='all';
};
R.period=function(){
 R.init();const mode=state.admin.reportPeriodMode,d=state.admin.reportPeriodDate||R.today();
 if(mode==='day')return{mode,start:d,end:d,month:d.slice(0,7),label:'Daily · '+R.fmt(d)};
 if(mode==='saturday'){const base=d>R.today()?R.today():d,bd=R.fd(base),diff=(bd.getDay()+1)%7,sat=R.add(base,-diff);return{mode,start:sat,end:sat,month:sat.slice(0,7),label:'Saturday · '+R.fmt(sat)}}
 if(mode==='week'){const a=R.mon(d),z=R.add(a,6),b=z>R.today()?R.today():z;return{mode,start:a,end:b,month:b.slice(0,7),label:'Week · '+R.fmt(a)+' to '+R.fmt(b)}}
 if(mode==='mtd'){const b=d>R.today()?R.today():d;return{mode,start:b.slice(0,7)+'-01',end:b,month:b.slice(0,7),label:'MTD · '+R.fmt(b.slice(0,7)+'-01')+' to '+R.fmt(b)}}
 const m=state.admin.reportPeriodMonth,a=R.ms(m),z=R.me(m),b=z>R.today()?R.today():z;
 if(mode==='saturdays')return{mode,start:a,end:b,month:m,label:'All Saturdays · '+R.ml(m)};
 return{mode,start:a,end:b,month:m,label:'Month · '+R.ml(m)+(m===R.today().slice(0,7)?' to '+R.fmt(b):'')};
};
R.sites=()=> (state.config.sites||[]).filter(s=>!['upper management','floaters'].includes(String(s.name||'').toLowerCase()));
R.siteName=id=>{const s=(state.config.sites||[]).find(x=>String(x.id)===String(id));return s?s.name:String(id||'')};
R.key=s=>{let n=String(s.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(n.includes('etac-workshop'))return'peterlee';if(n.includes('chester'))return'chester-le-street';return n};
R.workshops=function(){try{return new Set(targetWorkshopSites().map(x=>String(x.site.id)))}catch(e){return new Set()}};
R.api=async p=>{const x=await fetch(SUPABASE_URL+'/rest/v1/'+p,{headers:await authHeaders(),cache:'no-store'});if(!x.ok)throw Error('Report data '+x.status);return x.json()};

R.delta=function(rows,key,a,b){let t=0,last={};rows.forEach(r=>{const d=String(r.snapshot_date),m=d.slice(0,7),v=R.n(r[key]),q=last[m]||0;if(R.inr(d,a,b))t+=v-q;last[m]=v});return t};
R.dailySeries=function(rows,key){
 const out=[],last={};
 rows.forEach(r=>{
  const d=String(r.snapshot_date||''),m=d.slice(0,7),v=R.n(r[key]),q=last[m]||0;
  out.push({date:d,value:v-q});last[m]=v;
 });
 return out;
};
R.target=function(id,p){
 const s=state.targetSheets&&state.targetSheets[p.month]&&state.targetSheets[p.month].sites&&state.targetSheets[p.month].sites[id];if(!s)return null;
 const ds=(s.days||[]).filter(d=>d.open&&R.inr(d.date,p.start,p.end)&&(p.mode!=='saturdays'||d.saturday===true||Number(d.dow)===6));
 const dayTargets={};ds.forEach(d=>{dayTargets[String(d.date)]=R.n(d.target)});
 return{
  target:ds.reduce((n,d)=>n+R.n(d.target),0),
  days:ds.length,
  saturdayTarget:ds.filter(d=>d.saturday===true||Number(d.dow)===6).reduce((n,d)=>n+R.n(d.target),0),
  weekdayTarget:ds.filter(d=>!(d.saturday===true||Number(d.dow)===6)).reduce((n,d)=>n+R.n(d.target),0),
  saturdayDays:ds.filter(d=>d.saturday===true||Number(d.dow)===6).length,
  dayTargets
 };
};
R.weekDone=r=>{try{return weeklyRecordComplete(r,(state.config.sites||[]).find(s=>String(s.id)===String(r.site_id)))}catch(e){return!!(r.weekly_timesheet_done&&r.site_cleaning_done&&r.stock_take_done&&r.oxy_acetylene_done)}};
R.hsIssues=h=>{if(!h)return[];const s=(h.draft_checks&&Object.keys(h.draft_checks).length?h.draft_checks:h.checks)||{},a=[];Object.keys(s).forEach(k=>{const q=s[k]||{};if(q.status==='issue')a.push((q.label||k)+(q.note?' — '+q.note:''))});if(String(h.draft_manager_notes||h.manager_notes||'').trim())a.push('Manager note — '+String(h.draft_manager_notes||h.manager_notes).trim());return a};

R.people=function(p,rates){
 const rate=new Map((rates||[]).map(x=>[String(x.employee_id),R.n(x.pay_rate)]));
 const sick=new Map(),holiday=new Map(),pending=new Map(),overrides=new Map();
 (state.absences||[]).forEach(a=>{if(a&&a.type==='sick'&&R.allowedDate(a.date,p))sick.set(String(a.employeeId),(sick.get(String(a.employeeId))||0)+1)});
 (state.requests||[]).forEach(r=>(r&&r.dates||[]).forEach(x=>{let d='',amt=1;try{d=dateEntryDate(x);amt=dateEntryAmount(x)}catch(e){d=typeof x==='string'?x:x&&x.date}if(!R.allowedDate(d,p))return;const m=r.status==='approved'?holiday:r.status==='pending'?pending:null;if(m)m.set(String(r.employeeId),(m.get(String(r.employeeId))||0)+R.n(amt||1))}));
 const extras=state.timesheetExtras||{};Object.keys(extras).forEach(w=>Object.entries((extras[w]&&extras[w].employees)||{}).forEach(([id,v])=>Object.entries(v.hoursOverride||{}).forEach(([d,h])=>{if(R.allowedDate(d,p)&&String(h).trim()!=='')overrides.set(id+'|'+d,R.n(h))})));
 let shifts={};try{shifts=computeAllShifts()}catch(e){}
 const bonus=((state.bonusSheets||{})[p.month]||{}).employees||{};
 return(state.config.employees||[]).filter(e=>e.active!==false).map(e=>{
  const arr=((shifts[e.id]&&shifts[e.id].shifts)||[]).filter(s=>R.allowedDate(s.date,p)),by={};arr.forEach(s=>(by[s.date]=by[s.date]||[]).push(s));
  let hours=0,worked=0,auto=0,manual=0;const dayHours={},dayAuto={},daySites={};
  Object.keys(by).forEach(d=>{let h=0;try{h=paidHoursForDay(by[d],d,e.siteId,e)}catch(x){h=by[d].reduce((n,s)=>n+Math.max(0,(R.n(s.outTs)-R.n(s.inTs))/3600000),0)}if(overrides.has(e.id+'|'+d)){h=overrides.get(e.id+'|'+d);manual++}if(h>0)worked++;const ac=by[d].filter(s=>s.autoClosed).length;hours+=h;auto+=ac;dayHours[d]=h;dayAuto[d]=ac;daySites[d]=String((by[d][0]&&by[d][0].siteId)||e.siteId||'');});
  let bf={score:0};try{bf=bradfordStatsForEmployee(e,p.end)}catch(x){}
  const b=bonus[e.id]||{},bon=R.n(b.owed)+R.n(b.extra)-R.n(b.damages),pr=rate.has(String(e.id))?rate.get(String(e.id)):null;
  return{id:String(e.id),name:e.name,siteId:String(e.siteId),hours,worked,sick:sick.get(String(e.id))||0,holiday:holiday.get(String(e.id))||0,pending:pending.get(String(e.id))||0,bradford:R.n(bf.score),auto,manual,bonus:bon,payRate:pr,payRef:pr==null?null:hours*pr,dayHours,dayAuto,daySites};
 });
};

R.load=async function(force){
 const p=R.period(),key=[p.mode,p.start,p.end,p.month].join('|');if(R.cache.busy)return;if(!force&&R.cache.key===key&&R.cache.data)return;R.cache={key,busy:true,error:'',data:null};
 try{
  const q=await Promise.all([
   R.api('sales_daily_snapshots?select=*&snapshot_date=gte.'+encodeURIComponent(R.ms(p.start.slice(0,7)))+'&snapshot_date=lte.'+encodeURIComponent(p.end)+'&order=snapshot_date.asc'),
   R.api('stock_value_snapshots?select=*&snapshot_date=gte.'+encodeURIComponent(R.add(p.end,-90))+'&snapshot_date=lte.'+encodeURIComponent(p.end)+'&order=snapshot_date.desc'),
   R.api('weekly_site_checks?select=*&week_start=gte.'+encodeURIComponent(R.mon(p.start))+'&week_start=lte.'+encodeURIComponent(p.end)+'&order=week_start.desc'),
   R.api('monthly_hs_checks?select=*&month_start=eq.'+encodeURIComponent(p.month+'-01')),
   R.api('monthly_hs_acknowledgements?select=*&month_start=eq.'+encodeURIComponent(p.month+'-01')),
   R.api('mot_monthly_qc?select=*&month_start=eq.'+encodeURIComponent(p.month+'-01')),
   R.api('staff_pay_rates?select=employee_id,pay_rate')
  ]);
  const stock=new Map();q[1].forEach(r=>{if(!stock.has(String(r.site_key)))stock.set(String(r.site_key),r)});
  R.cache.data={p,sales:q[0],stock,weekly:q[2],hs:q[3],acks:q[4],mot:q[5],rates:q[6]||[]};
 }catch(e){R.cache.error=e.message||String(e)}
 R.cache.busy=false;try{if(state.admin.tab==='fullreport')render()}catch(e){}
};

R.model=function(){
 const d=R.cache.data,p=d.p,people=R.people(p,d.rates||[]),work=R.workshops(),hm=new Map(d.hs.map(x=>[String(x.site_id),x])),mm=new Map(d.mot.map(x=>[String(x.site_id),x])),am=new Map();d.acks.forEach(x=>am.set(String(x.site_id),(am.get(String(x.site_id))||0)+1));
 return{p,people,sites:R.sites().map(s=>{
  const id=String(s.id),k=R.key(s),rows=d.sales.filter(x=>String(x.site_key)===k).sort((a,b)=>String(a.snapshot_date).localeCompare(String(b.snapshot_date))),last=rows.filter(x=>String(x.snapshot_date)<=p.end).slice(-1)[0],t=R.target(id,p),w=d.weekly.filter(x=>String(x.site_id)===id),h=hm.get(id)||null,m=mm.get(id)||null,st=d.stock.get(k),expected=Array.isArray(h&&h.expected_staff)?h.expected_staff.length:0,pe=people.filter(x=>x.siteId===id);
  const daily=R.dailySeries(rows,'total_current').filter(x=>R.inr(x.date,p.start,p.end));
  const saturdays=daily.filter(x=>R.fd(x.date).getDay()===6);
  const saturdayDetail=saturdays.map(x=>{
    const target=t&&t.dayTargets?R.n(t.dayTargets[x.date]):0;
    const staff=people.filter(e=>{
      if(R.n(e.dayHours&&e.dayHours[x.date])<=0)return false;
      let reportSite=String((e.daySites&&e.daySites[x.date])||e.siteId||'');
      try{if(typeof isFillingStationSite==='function'&&isFillingStationSite(e.siteId))reportSite=String(e.siteId||'');}catch(_e){}
      return reportSite===id;
    });
    const source=rows.find(r=>String(r.snapshot_date)===String(x.date));
    const margin=source&&source.margin_current!=null?R.n(source.margin_current):null;
    const wages=staff.reduce((n,e)=>n+(e.payRate==null?0:R.n(e.dayHours[x.date])*R.n(e.payRate)),0);
    const missingRates=staff.filter(e=>e.payRate==null).length;
    const grossEstimate=margin==null?null:x.value*margin/100;
    const afterWages=grossEstimate==null?null:grossEstimate-wages;
    return{date:x.date,sales:x.value,target,variance:x.value-target,hours:staff.reduce((n,e)=>n+R.n(e.dayHours[x.date]),0),staff:staff.length,auto:staff.reduce((n,e)=>n+R.n(e.dayAuto&&e.dayAuto[x.date]),0),wages,missingRates,margin,grossEstimate,afterWages};
  });
  const satSales=saturdayDetail.reduce((n,x)=>n+x.sales,0),satTarget=saturdayDetail.reduce((n,x)=>n+x.target,0),satHours=saturdayDetail.reduce((n,x)=>n+x.hours,0),satStaffShifts=saturdayDetail.reduce((n,x)=>n+x.staff,0),satAuto=saturdayDetail.reduce((n,x)=>n+x.auto,0),satHit=saturdayDetail.filter(x=>x.target>0&&x.sales>=x.target).length,satWages=saturdayDetail.reduce((n,x)=>n+x.wages,0),satMissingRates=saturdayDetail.reduce((n,x)=>n+x.missingRates,0),satGross=saturdayDetail.reduce((n,x)=>n+(x.grossEstimate==null?0:x.grossEstimate),0),satAfterWages=saturdayDetail.reduce((n,x)=>n+(x.afterWages==null?0:x.afterWages),0);
  const weekdayDetail=daily.filter(x=>{const q=R.fd(x.date).getDay();return q>=1&&q<=5;});
  const weekdaySales=weekdayDetail.reduce((n,x)=>n+x.value,0),weekdayTarget=t?t.weekdayTarget:0;
  const priorDaily=R.dailySeries(rows,'total_prior').filter(x=>R.inr(x.date,p.start,p.end));
  const reportSales=p.mode==='saturdays'?satSales:R.delta(rows,'total_current',p.start,p.end);
  const reportCompare=p.mode==='saturdays'?priorDaily.filter(x=>R.fd(x.date).getDay()===6).reduce((n,x)=>n+x.value,0):R.delta(rows,'total_prior',p.start,p.end);
  return{id,name:s.name,workshop:work.has(id),people:pe,head:pe.length,hours:pe.reduce((n,x)=>n+x.hours,0),sick:pe.reduce((n,x)=>n+x.sick,0),holiday:pe.reduce((n,x)=>n+x.holiday,0),pending:pe.reduce((n,x)=>n+x.pending,0),auto:pe.reduce((n,x)=>n+x.auto,0),manual:pe.reduce((n,x)=>n+x.manual,0),bonus:pe.reduce((n,x)=>n+x.bonus,0),sales:reportSales,compare:reportCompare,margin:last&&last.margin_current!=null?R.n(last.margin_current):null,target:t?t.target:0,stock:st?R.n(st.stock_value):0,stockDate:st&&st.snapshot_date,weekly:w,weeklyDone:w.filter(R.weekDone).length,hs:h,hsIssues:R.hsIssues(h),expected,acked:am.get(id)||0,mot:m,saturday:{count:saturdayDetail.length,sales:satSales,target:satTarget,variance:satSales-satTarget,hours:satHours,staffShifts:satStaffShifts,auto:satAuto,hit:satHit,wages:satWages,missingRates:satMissingRates,grossEstimate:satGross,afterWages:satAfterWages,detail:saturdayDetail,weekdaySales,weekdayTarget}};
 })};
};
})();