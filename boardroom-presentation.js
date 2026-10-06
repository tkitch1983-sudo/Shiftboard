(function(){
'use strict';

const TAB='boardroom';
const R=window.NEASFullReport;
if(!R)return;

const B=window.NEASBoardroom=window.NEASBoardroom||{
  slide:0,
  paused:false,
  timer:null,
  refreshTimer:null,
  attendanceTimer:null,
  clockTimer:null,
  wakeLock:null,
  attendanceBusy:false,
  attendanceLoadedAt:'',
  liveEvents:null,
  prefsLoaded:false,
  mobilePresentation:false,
  directRequested:false,
  lastLoaded:'',
  lastError:''
};

function e(v){return R.e(v)}
function n(v){return R.n(v)}
function money(v){return R.money(v)}
function dec(v,d){return R.dec(v,d==null?0:d)}
function pct(v){return R.pct(v)}
function today(){return R.today()}
function fmt(v){return R.fmt(v)}
function isTony(){try{return typeof isTonyLogin==='function'&&isTonyLogin()}catch(_e){return false}}

function directBoardroomUrl(){
  const u=new URL(location.href);
  u.pathname='/boardroom';
  u.search='';
  u.hash='';
  return u.toString();
}
function directRequested(){
  try{
    const q=new URLSearchParams(location.search);
    const path=String(location.pathname||'').replace(/\/+$/,'').toLowerCase();
    return path==='/boardroom'||q.get('boardroom')==='1'||String(location.hash||'').toLowerCase()==='#boardroom';
  }catch(_e){return false}
}
B.directRequested=directRequested();

async function copyBoardroomLink(){
  const url=directBoardroomUrl();
  try{
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(url);
      try{showToast('Direct Boardroom link copied.')}catch(_e){}
      return;
    }
  }catch(_e){}
  try{window.prompt('Copy this Boardroom link',url)}catch(_e){}
}

const BOARDROOM_PREFS_KEY='neas_boardroom_prefs_v1';
const BOARDROOM_SLIDE_LABELS={
  pulse:'Business pulse',
  performance:'Workshop performance',
  mtd:'Month to date sales',
  trend:'Recent sales trend',
  people:'People today',
  attendance:'Live attendance & dinner',
  status:'Live site status (names)',
  weekly:'Weekly checks',
  safety:'H&S / MOT monthly',
  actions:'Actions & compliance',
  stock:'Stock overview'
};

function ensureState(){
  if(!state.admin.boardroomSpeed)state.admin.boardroomSpeed=20;
  if(state.admin.boardroomShowStock===undefined)state.admin.boardroomShowStock=true;
  if(!B.prefsLoaded){
    B.prefsLoaded=true;
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(BOARDROOM_PREFS_KEY)||'null')}catch(_e){}
    if(saved&&Number(saved.speed)>=10)state.admin.boardroomSpeed=Number(saved.speed);
    const defaults={pulse:true,performance:true,mtd:true,trend:true,people:true,attendance:true,status:true,weekly:true,safety:true,actions:true,stock:state.admin.boardroomShowStock!==false};
    const incoming=saved&&saved.slides&&typeof saved.slides==='object'?saved.slides:{};
    state.admin.boardroomSlides=Object.assign(defaults,incoming);
    state.admin.boardroomShowStock=state.admin.boardroomSlides.stock!==false;
  }
  if(!state.admin.boardroomSlides){
    state.admin.boardroomSlides={pulse:true,performance:true,mtd:true,trend:true,people:true,attendance:true,status:true,weekly:true,safety:true,actions:true,stock:state.admin.boardroomShowStock!==false};
  }
}

function saveBoardroomPrefs(){
  try{
    localStorage.setItem(BOARDROOM_PREFS_KEY,JSON.stringify({
      speed:Number(state.admin.boardroomSpeed)||20,
      slides:state.admin.boardroomSlides||{}
    }));
  }catch(_e){}
}

function enabledSlideCount(){
  ensureState();
  return Object.keys(BOARDROOM_SLIDE_LABELS).filter(k=>state.admin.boardroomSlides[k]!==false).length;
}

function slidePickerHtml(){
  ensureState();
  const boxes=Object.entries(BOARDROOM_SLIDE_LABELS).map(([key,label])=>
    '<label style="display:flex;gap:7px;align-items:center;font-size:12px;white-space:nowrap;"><input type="checkbox" data-boardroom-slide-toggle="'+key+'" '+(state.admin.boardroomSlides[key]!==false?'checked':'')+'> '+e(label)+'</label>'
  ).join('');
  return '<details style="position:relative;"><summary class="add-btn" style="list-style:none;cursor:pointer;">Choose slides</summary><div style="position:absolute;right:0;top:calc(100% + 6px);z-index:30;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;box-shadow:0 14px 34px rgba(0,0,0,.28);display:grid;gap:8px;min-width:210px;">'+boxes+'</div></details>';
}

function statusTone(value,target){
  if(!target)return 'var(--muted)';
  return value>=target?'var(--green)':'var(--red)';
}

function pill(text,tone){
  return '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--line);border-radius:999px;font-size:11px;font-weight:800;color:'+tone+';">'+e(text)+'</span>';
}

function metric(label,value,sub,tone){
  return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;min-height:112px;display:flex;flex-direction:column;justify-content:space-between;">'
    +'<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:800;">'+e(label)+'</div>'
    +'<div class="mono" style="font-size:34px;line-height:1.05;font-weight:900;color:'+(tone||'var(--text)')+';">'+value+'</div>'
    +(sub?'<div style="font-size:12px;color:var(--muted);">'+e(sub)+'</div>':'')
    +'</div>';
}

function latestSnapshotDate(){
  const d=R.cache&&R.cache.data;
  if(!d||!Array.isArray(d.sales)||!d.sales.length)return null;
  return d.sales.map(x=>String(x.snapshot_date||'')).filter(Boolean).sort().slice(-1)[0]||null;
}

function currentModel(){
  if(!R.cache||!R.cache.data)return null;
  try{return R.model()}catch(err){console.error('Boardroom model failed',err);return null}
}

function siteIssues(s,p){
  try{return R.issues(s,p)||[]}catch(_e){return[]}
}

function dailyTrend(model){
  const data=R.cache&&R.cache.data;if(!data)return[];
  const map=new Map();
  model.sites.forEach(s=>{
    const key=R.key({name:s.name});
    const rows=(data.sales||[]).filter(x=>String(x.site_key)===String(key)).sort((a,b)=>String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    R.dailySeries(rows,'total_current').forEach(x=>{
      if(String(x.date)<=model.p.end)map.set(x.date,(map.get(x.date)||0)+n(x.value));
    });
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-8).map(([date,value])=>({date,value}));
}

function liveBoardroomRoster(model){
  const modelIds=new Set(model.sites.map(s=>String(s.id)));
  const allEmployees=(state.config&&Array.isArray(state.config.employees)?state.config.employees:[]).filter(emp=>emp&&emp.active!==false);
  const employeeMap=new Map(allEmployees.map(emp=>[String(emp.id),emp]));
  const sourceEvents=Array.isArray(B.liveEvents)?B.liveEvents:(Array.isArray(state.events)?state.events:[]);
  const todayIso=today();
  const events=sourceEvents.filter(ev=>{
    if(!ev||!ev.employeeId||!ev.timestamp)return false;
    const d=new Date(Number(ev.timestamp));
    return !Number.isNaN(d.getTime())&&R.iso(d)===todayIso;
  }).sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
  const latestByEmployee=new Map();
  events.forEach(ev=>latestByEmployee.set(String(ev.employeeId),ev));

  const records=[];
  allEmployees.forEach(emp=>{
    const id=String(emp.id),homeSite=String(emp.siteId||''),ev=latestByEmployee.get(id)||null;
    const eventSite=ev?String(ev.siteId||''):'';
    const siteId=ev&&modelIds.has(eventSite)?eventSite:(modelIds.has(homeSite)?homeSite:'');
    if(!siteId)return;
    let status='not_clocked';
    if(ev&&ev.type==='in')status='on';
    else if(ev&&ev.type==='out'&&String(ev.outReason||'')==='dinner')status='dinner';
    else if(ev&&ev.type==='out'&&String(ev.outReason||'')==='travel')status='travel';
    else if(ev&&ev.type==='out')status='off';
    const time=ev?new Date(Number(ev.timestamp)).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
    records.push({
      id,name:String(emp.name||'—'),homeSite,siteId,status,time,event:ev,
      visitor:!!(ev&&eventSite&&eventSite!==homeSite)
    });
  });

  return{events,latestByEmployee,employeeMap,records};
}

function mtdBoardroomMetrics(model){
  const d=R.cache&&R.cache.data;
  const month=today().slice(0,7);
  const start=month+'-01';
  const monthRows=d&&Array.isArray(d.sales)
    ? d.sales.filter(x=>String(x.snapshot_date||'').slice(0,7)===month)
    : [];
  const latest=monthRows.map(x=>String(x.snapshot_date||'').slice(0,10)).filter(Boolean).sort().slice(-1)[0]||null;
  const end=latest||today();
  const p={mode:'mtd',start,end,month,label:'MTD'};
  const rows=model.sites.map(site=>{
    const key=R.key({name:site.name});
    const salesRows=monthRows
      .filter(x=>String(x.site_key)===String(key))
      .sort((a,b)=>String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    const sales=latest?R.delta(salesRows,'total_current',start,end):0;
    const prior=latest?R.delta(salesRows,'total_prior',start,end):0;
    const targetInfo=R.target(String(site.id),p);
    const target=latest&&targetInfo?targetInfo.target:0;
    const variance=sales-target;
    return{
      id:String(site.id),
      name:site.name,
      sales,
      prior,
      target,
      variance,
      attainment:target?sales/target*100:null
    };
  });
  const byId=new Map(rows.map(x=>[String(x.id),x]));
  const groupSales=rows.reduce((a,x)=>a+n(x.sales),0);
  const groupTarget=rows.reduce((a,x)=>a+n(x.target),0);
  const groupPrior=rows.reduce((a,x)=>a+n(x.prior),0);
  return{
    start,end,latest,rows,byId,
    groupSales,
    groupTarget,
    groupPrior,
    groupVariance:groupSales-groupTarget,
    groupVsPrior:groupSales-groupPrior
  };
}

function pulseSlide(model){
  const sites=model.sites;
  const mtd=mtdBoardroomMetrics(model);
  const sales=mtd.groupSales,target=mtd.groupTarget,variance=mtd.groupVariance;
  const live=liveBoardroomRoster(model);
  const staffWorking=live.records.filter(x=>x.status==='on').length;
  const dinnerNow=live.records.filter(x=>x.status==='dinner').length;
  const travellingNow=live.records.filter(x=>x.status==='travel').length;
  const sick=sites.reduce((a,s)=>a+n(s.sick),0);
  const holidays=sites.reduce((a,s)=>a+n(s.holiday),0);
  const issues=sites.reduce((a,s)=>a+siteIssues(s,model.p).length,0);
  const latest=latestSnapshotDate();
  return {
    title:'Business pulse',
    kicker:'Month-to-date sales + live workshop attendance',
    html:'<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;">'
      +metric('MTD sales',money(sales),mtd.latest?'Sales through '+fmt(mtd.latest):'No current-month sales snapshot yet')
      +metric('MTD target',target?money(target):'—',mtd.latest?'Target through '+fmt(mtd.end):'Waiting for sales data')
      +metric('MTD variance',target?((variance>=0?'+':'')+money(variance)):'—',target?(sales>=target?'At or above MTD target':'Behind MTD target'):'No MTD target set',target?statusTone(sales,target):'var(--muted)')
      +metric('People on site',String(staffWorking),dinnerNow+' dinner · '+travellingNow+' travelling',staffWorking?'var(--green)':'var(--muted)')
      +metric('Sickness',String(sick),'Workdays recorded',sick?'var(--amber)':'var(--green)')
      +metric('Holiday',dec(holidays,1),'Approved days today')
      +metric('Items to review',String(issues),'Operational / compliance',issues?'var(--red)':'var(--green)')
      +metric('Workshops',String(sites.length),'Workshop reporting only')
      +'</div>'
  };
}

function performanceSlide(model){
  const mtd=mtdBoardroomMetrics(model);
  const cards=model.sites.slice().sort((a,b)=>{
    const am=mtd.byId.get(String(a.id))||{target:0,sales:0};
    const bm=mtd.byId.get(String(b.id))||{target:0,sales:0};
    const av=am.target?((am.sales-am.target)/am.target):0,bv=bm.target?((bm.sales-bm.target)/bm.target):0;
    return av-bv;
  }).map(s=>{
    const sm=mtd.byId.get(String(s.id))||{sales:0,target:0,variance:0,attainment:null};
    const v=n(sm.variance),att=sm.attainment,issues=siteIssues(s,model.p).length;
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:1.4fr .9fr .9fr .8fr;align-items:center;gap:14px;">'
      +'<div><div style="font-size:19px;font-weight:900;">'+e(s.name)+'</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">'+(att==null?pill('No target','var(--muted)'):pill(att.toFixed(1)+'% of target',att>=100?'var(--green)':'var(--red)'))+(issues?pill(issues+' issue'+(issues===1?'':'s'),'var(--red)'):pill('No issues','var(--green)'))+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">MTD sales</div><div class="mono" style="font-size:24px;font-weight:900;">'+money(sm.sales)+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">MTD variance</div><div class="mono" style="font-size:24px;font-weight:900;color:'+(sm.target?(v<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(sm.target?((v>=0?'+':'')+money(v)):'—')+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">Margin</div><div class="mono" style="font-size:22px;font-weight:900;">'+pct(s.margin)+'</div></div>'
      +'</div>';
  }).join('');
  return {title:'Workshop performance',kicker:'Month-to-date sales and target by site'+(mtd.latest?' · through '+fmt(mtd.latest):''),html:'<div style="display:grid;gap:10px;">'+cards+'</div>'};
}

function monthToDateSlide(model){
  const mtd=mtdBoardroomMetrics(model);
  if(!mtd.latest)return{title:'Month to date sales',kicker:'Workshop sales against month-to-date targets',html:'<div style="font-size:24px;color:var(--muted);padding:40px 0;">No current-month sales snapshot is available yet.</div>'};

  const rows=mtd.rows.slice().sort((a,b)=>n(b.variance)-n(a.variance));
  const cards=rows.map(x=>
    '<div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 15px;display:grid;grid-template-columns:1.35fr .9fr .9fr .7fr;gap:12px;align-items:center;">'
    +'<div><b style="font-size:17px;">'+e(x.name)+'</b><div style="font-size:11px;color:var(--muted);margin-top:3px;">'+(x.attainment==null?'No MTD target':x.attainment.toFixed(1)+'% of MTD target')+'</div></div>'
    +'<div><small style="color:var(--muted);">MTD sales</small><div class="mono" style="font-size:21px;font-weight:900;">'+money(x.sales)+'</div></div>'
    +'<div><small style="color:var(--muted);">Variance</small><div class="mono" style="font-size:21px;font-weight:900;color:'+(x.target?(x.variance>=0?'var(--green)':'var(--red)'):'var(--muted)')+';">'+(x.target?((x.variance>=0?'+':'')+money(x.variance)):'—')+'</div></div>'
    +'<div><small style="color:var(--muted);">vs prior</small><div class="mono" style="font-size:18px;font-weight:800;color:'+(x.sales>=x.prior?'var(--green)':'var(--red)')+';">'+((x.sales-x.prior)>=0?'+':'')+money(x.sales-x.prior)+'</div></div>'
    +'</div>'
  ).join('');

  return {title:'Month to date sales',kicker:'Workshop group · '+fmt(mtd.start)+' to '+fmt(mtd.end)+' · aligned to latest saved sales snapshot',html:
    '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px;">'
    +metric('MTD sales',money(mtd.groupSales),'Workshop group')
    +metric('MTD target',mtd.groupTarget?money(mtd.groupTarget):'—','Target through '+fmt(mtd.end))
    +metric('MTD variance',mtd.groupTarget?((mtd.groupVariance>=0?'+':'')+money(mtd.groupVariance)):'—',mtd.groupTarget?(mtd.groupVariance>=0?'Ahead of target':'Behind target'):'No target set',mtd.groupTarget?(mtd.groupVariance>=0?'var(--green)':'var(--red)'):'var(--muted)')
    +metric('Vs prior year',((mtd.groupVsPrior>=0?'+':'')+money(mtd.groupVsPrior)),'Same month-to-date',mtd.groupVsPrior>=0?'var(--green)':'var(--red)')
    +'</div><div style="display:grid;gap:8px;">'+cards+'</div>'};
}

function trendSlide(model){
  const trend=dailyTrend(model),max=Math.max(1,...trend.map(x=>x.value));
  if(!trend.length)return{title:'Sales trend',kicker:'Recent trading days',html:'<div style="font-size:24px;color:var(--muted);padding:40px 0;">Not enough daily snapshot history yet.</div>'};
  const bars=trend.map(x=>{
    const h=Math.max(4,Math.round((x.value/max)*230));
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;min-width:72px;flex:1;"><div class="mono" style="font-size:13px;font-weight:800;">'+money(x.value)+'</div><div style="height:'+h+'px;width:min(70%,58px);border-radius:8px 8px 3px 3px;background:var(--amber);"></div><div style="font-size:11px;color:var(--muted);">'+e(R.fd(x.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))+'</div></div>';
  }).join('');
  return {title:'Recent sales trend',kicker:'Group workshop sales from daily snapshots',html:'<div style="height:320px;display:flex;align-items:flex-end;gap:8px;padding:20px 8px 0;border-bottom:1px solid var(--line);">'+bars+'</div>'};
}

function peopleSlide(model){
  const live=liveBoardroomRoster(model);
  const cards=model.sites.map(s=>{
    const here=live.records.filter(x=>x.siteId===String(s.id));
    const onSite=here.filter(x=>x.status==='on').length;
    const dinner=here.filter(x=>x.status==='dinner').length;
    const travelling=here.filter(x=>x.status==='travel').length;
    const clockedToday=here.filter(x=>x.status!=='not_clocked').length;
    const issues=n(s.auto),missing=s.people.filter(x=>x.payRate==null).length;
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;"><div><div style="font-size:18px;font-weight:900;">'+e(s.name)+'</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+s.people.length+' active staff assigned</div></div>'+pill(onSite+' on site',onSite?'var(--green)':'var(--muted)')+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;"><div><small style="color:var(--muted);">Clocked today</small><div class="mono" style="font-size:21px;font-weight:800;">'+clockedToday+'</div></div><div><small style="color:var(--muted);">Dinner</small><div class="mono" style="font-size:21px;font-weight:800;color:'+(dinner?'var(--amber)':'var(--text)')+';">'+dinner+'</div></div><div><small style="color:var(--muted);">Travelling</small><div class="mono" style="font-size:21px;font-weight:800;">'+travelling+'</div></div><div><small style="color:var(--muted);">Auto-close</small><div class="mono" style="font-size:21px;font-weight:800;color:'+(issues?'var(--red)':'var(--text)')+';">'+issues+'</div></div></div>'
      +(missing?'<div style="font-size:11px;color:var(--amber);margin-top:10px;">'+missing+' workshop pay rate'+(missing===1?'':'s')+' missing</div>':'')
      +'</div>';
  }).join('');
  return {title:'People today',kicker:'Live workshop staffing from clock events · refreshes every 5 seconds',html:'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'+cards+'</div>'};
}

function liveAttendanceSlide(model){
  const live=liveBoardroomRoster(model);
  const siteCards=model.sites.map(site=>{
    const here=live.records.filter(x=>x.siteId===String(site.id));
    const onSite=here.filter(x=>x.status==='on').length;
    const dinner=here.filter(x=>x.status==='dinner').length;
    const travelling=here.filter(x=>x.status==='travel').length;
    const clockedToday=here.filter(x=>x.status!=='not_clocked').length;
    const offShift=here.filter(x=>x.status==='off').length;

    const siteEvents=live.events.filter(ev=>String(ev.siteId||'')===String(site.id)).sort((a,b)=>Number(b.timestamp)-Number(a.timestamp));
    const latest=siteEvents[0]||null;
    const time=latest?new Date(Number(latest.timestamp)).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
    const latestText=!latest?'No movement today'
      : latest.type==='in'?'Clocked in '+time
      : String(latest.outReason||'')==='dinner'?'Dinner '+time
      : String(latest.outReason||'')==='travel'?'Travel '+time
      : 'Clocked out '+time;

    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;"><div><div style="font-size:18px;font-weight:900;">'+e(site.name)+'</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+e(latestText)+'</div></div>'+pill(onSite+' on site',onSite?'var(--green)':'var(--muted)')+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;">'
        +'<div><small style="color:var(--muted);">Clocked today</small><div class="mono" style="font-size:21px;font-weight:800;">'+clockedToday+'</div></div>'
        +'<div><small style="color:var(--muted);">Dinner now</small><div class="mono" style="font-size:21px;font-weight:800;color:'+(dinner?'var(--amber)':'var(--text)')+';">'+dinner+'</div></div>'
        +'<div><small style="color:var(--muted);">Travelling</small><div class="mono" style="font-size:21px;font-weight:800;">'+travelling+'</div></div>'
        +'<div><small style="color:var(--muted);">Clocked off</small><div class="mono" style="font-size:21px;font-weight:800;">'+offShift+'</div></div>'
      +'</div>'
      +'</div>';
  }).join('');

  const totals=live.records.reduce((acc,row)=>{
    if(row.status==='on')acc.onSite++;
    else if(row.status==='dinner')acc.dinner++;
    else if(row.status==='travel')acc.travelling++;
    else if(row.status==='off')acc.offShift++;
    return acc;
  },{onSite:0,dinner:0,travelling:0,offShift:0});

  const refreshed=B.attendanceLoadedAt?new Date(B.attendanceLoadedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'waiting';
  return {title:'Live attendance & dinner',kicker:'Shiftboard clock status · refreshes every 5 seconds',html:
    '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px;">'
      +metric('On site now',String(totals.onSite),'Actual clocked location','var(--green)')
      +metric('On dinner',String(totals.dinner),'Clocked out for dinner',totals.dinner?'var(--amber)':'var(--text)')
      +metric('Travelling',String(totals.travelling),'Between sites')
      +metric('Clocked off',String(totals.offShift),'Finished / off site')
    +'</div>'
    +'<div style="font-size:11px;color:var(--muted);margin:-4px 0 12px;">Last attendance refresh: <b>'+e(refreshed)+'</b> · Staff working at another workshop appear at the site where they last clocked.</div>'
    +'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'+siteCards+'</div>'};
}

function liveSiteStatusSlide(model){
  const live=liveBoardroomRoster(model);
  const statusMeta={
    on:['ON SITE','var(--green)'],
    dinner:['DINNER','var(--amber)'],
    travel:['TRAVEL','var(--amber)'],
    off:['CLOCKED OFF','var(--muted)'],
    not_clocked:['NOT CLOCKED','var(--muted-2)']
  };
  const order={on:0,dinner:1,travel:2,off:3,not_clocked:4};
  const cards=model.sites.map(site=>{
    const rows=live.records.filter(x=>x.siteId===String(site.id)).sort((a,b)=>
      (order[a.status]-order[b.status])||a.name.localeCompare(b.name)
    );
    const on=rows.filter(x=>x.status==='on').length;
    const off=rows.filter(x=>x.status==='off').length;
    const dinner=rows.filter(x=>x.status==='dinner').length;
    const roster=rows.length?rows.map(row=>{
      const meta=statusMeta[row.status]||statusMeta.not_clocked;
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center;padding:4px 0;border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent);">'
        +'<div style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(row.name)+(row.visitor?' <span style="font-size:9px;color:var(--amber);">VISITOR</span>':'')+'</div>'
        +'<span style="font-size:9px;font-weight:900;color:'+meta[1]+';">'+e(meta[0])+'</span>'
        +'<span class="mono" style="font-size:10px;color:var(--muted);min-width:34px;text-align:right;">'+e(row.time||'—')+'</span>'
        +'</div>';
    }).join(''):'<div style="font-size:12px;color:var(--muted);padding:8px 0;">No workshop staff listed.</div>';

    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 12px;min-width:0;">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;"><b style="font-size:15px;">'+e(site.name)+'</b>'+pill(on+' in','var(--green)')+'</div>'
      +'<div style="font-size:9px;color:var(--muted);margin-bottom:5px;">'+dinner+' dinner · '+off+' clocked off</div>'
      +roster+'</div>';
  }).join('');
  return {title:'Live site status',kicker:'Who is on site, at dinner, travelling or clocked off · live from Shiftboard',html:
    '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;">'+cards+'</div>'};
}

function weeklyChecksSlide(model){
  const weekStart=R.mon(today());
  const cards=model.sites.map(site=>{
    const rows=(site.weekly||[]).filter(x=>String(x.week_start||'')===String(weekStart));
    const row=rows.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0]||null;
    const done=!!(row&&R.weekDone(row));
    const completeBits=row?[
      !!row.weekly_timesheet_done,
      !!row.site_cleaning_done,
      !!row.stock_take_done,
      !!row.oxy_acetylene_done
    ].filter(Boolean).length:0;
    const flags=[];
    if(row&&String(row.maintenance_status||'').toUpperCase()!=='OK')flags.push('Maintenance');
    if(row&&String(row.mot_log_status||'').toLowerCase()!=='up_to_date')flags.push('MOT log');
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px;">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b style="font-size:18px;">'+e(site.name)+'</b>'+pill(row?(done?'Complete':'In progress'):'Not started',done?'var(--green)':(row?'var(--amber)':'var(--red)'))+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin-top:8px;">'+(row?(completeBits+'/4 core checks complete'):'No weekly record yet')+(flags.length?' · '+e(flags.join(', '))+' needs review':'')+'</div>'
      +'</div>';
  }).join('');
  const complete=model.sites.filter(site=>{
    const row=(site.weekly||[]).find(x=>String(x.week_start||'')===String(weekStart));
    return !!(row&&R.weekDone(row));
  }).length;
  return {title:'Weekly checks',kicker:'Week beginning '+fmt(weekStart),html:
    '<div style="display:grid;grid-template-columns:1fr 3fr;gap:16px;align-items:start;margin-bottom:14px;">'
      +metric('Sites complete',complete+' / '+model.sites.length,'Weekly digital checks',complete===model.sites.length?'var(--green)':'var(--amber)')
      +'<div style="font-size:13px;color:var(--muted);padding-top:7px;">Tracks the weekly timesheet, site cleaning, stock take and oxy-acetylene checks already recorded in Shiftboard.</div>'
    +'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">'+cards+'</div>'};
}

function safetyMotSlide(model){
  const cards=model.sites.map(site=>{
    const hs=site.hs||null,mot=site.mot||null,issues=Array.isArray(site.hsIssues)?site.hsIssues:[];
    const hsPublished=!!(hs&&(hs.published_at||String(hs.status||'').toLowerCase()==='published'));
    const hsStatus=!hs?'Not started':issues.length?(issues.length+' issue'+(issues.length===1?'':'s')):(hsPublished?'Published':'In progress');
    const hsTone=!hs?'var(--red)':issues.length?'var(--red)':hsPublished?'var(--green)':'var(--amber)';
    const motComplete=!!(mot&&mot.completed);
    const motStatus=!mot?'Not started':motComplete?'Complete':(mot.checked_through?'Checked to '+fmt(mot.checked_through):'In progress');
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px;">'
      +'<div style="font-size:18px;font-weight:900;margin-bottom:10px;">'+e(site.name)+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        +'<div><small style="color:var(--muted);">H&S</small><div style="margin-top:4px;">'+pill(hsStatus,hsTone)+'</div></div>'
        +'<div><small style="color:var(--muted);">MOT QC</small><div style="margin-top:4px;">'+pill(motStatus,motComplete?'var(--green)':(mot?'var(--amber)':'var(--red)'))+'</div></div>'
      +'</div>'
      +'</div>';
  }).join('');
  const hsGood=model.sites.filter(s=>s.hs&&!((s.hsIssues||[]).length)&&(s.hs.published_at||String(s.hs.status||'').toLowerCase()==='published')).length;
  const motGood=model.sites.filter(s=>s.mot&&s.mot.completed).length;
  return {title:'H&S / MOT monthly',kicker:R.ml(today().slice(0,7)),html:
    '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px;">'
      +metric('H&S published',hsGood+' / '+model.sites.length,'No saved H&S issues','var(--green)')
      +metric('MOT QC complete',motGood+' / '+model.sites.length,'Monthly MOT quality control',motGood===model.sites.length?'var(--green)':'var(--amber)')
    +'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">'+cards+'</div>'};
}

function actionsSlide(model){
  const items=[];
  model.sites.forEach(s=>{
    siteIssues(s,model.p).forEach(x=>items.push({site:s.name,area:x[0],text:x[1]}));
    try{
      const d=R.done(s,model.p);
      (d.no||[]).forEach(x=>{
        if(!items.some(i=>i.site===s.name&&i.text===x))items.push({site:s.name,area:'Outstanding',text:x});
      });
    }catch(_e){}
  });
  const shown=items.slice(0,12);
  const html=shown.length?'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">'+shown.map(x=>'<div style="background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--red);border-radius:12px;padding:14px;"><div style="display:flex;justify-content:space-between;gap:10px;"><b style="font-size:17px;">'+e(x.site)+'</b>'+pill(x.area,'var(--amber)')+'</div><div style="font-size:14px;line-height:1.45;margin-top:8px;">'+e(x.text)+'</div></div>').join('')+'</div>':'<div style="display:flex;align-items:center;justify-content:center;min-height:300px;"><div style="text-align:center;"><div style="font-size:54px;color:var(--green);">✓</div><div style="font-size:26px;font-weight:900;margin-top:8px;">No saved operational or compliance issues</div></div></div>';
  return {title:'Actions & compliance',kicker:items.length?(items.length+' item'+(items.length===1?'':'s')+' currently need review'):'Nothing currently flagged',html};
}

function stockSlide(model){
  const rows=model.sites.slice().sort((a,b)=>n(b.stock)-n(a.stock)),total=rows.reduce((a,s)=>a+n(s.stock),0);
  const html='<div style="display:grid;grid-template-columns:1fr 2fr;gap:18px;align-items:start;">'
    +metric('Latest stock value',money(total),'Combined workshop snapshots')
    +'<div style="display:grid;gap:9px;">'+rows.map(s=>'<div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;gap:12px;"><div><b style="font-size:17px;">'+e(s.name)+'</b><div style="font-size:11px;color:var(--muted);margin-top:2px;">'+(s.stockDate?'Snapshot '+fmt(s.stockDate):'No stock snapshot')+'</div></div><div class="mono" style="font-size:23px;font-weight:900;">'+money(s.stock)+'</div></div>').join('')+'</div></div>';
  return {title:'Stock overview',kicker:'Latest saved workshop stock values',html};
}

function slidesFor(model){
  ensureState();
  const defs=[
    ['pulse',pulseSlide],
    ['performance',performanceSlide],
    ['mtd',monthToDateSlide],
    ['trend',trendSlide],
    ['people',peopleSlide],
    ['attendance',liveAttendanceSlide],
    ['status',liveSiteStatusSlide],
    ['weekly',weeklyChecksSlide],
    ['safety',safetyMotSlide],
    ['actions',actionsSlide],
    ['stock',stockSlide]
  ];
  let arr=defs.filter(([key])=>state.admin.boardroomSlides[key]!==false).map(([key,build])=>Object.assign({key},build(model)));
  if(!arr.length){
    state.admin.boardroomSlides.pulse=true;
    arr=[Object.assign({key:'pulse'},pulseSlide(model))];
  }
  return arr;
}

function renderSlide(model){
  ensureState();
  const slides=slidesFor(model);
  if(B.slide>=slides.length)B.slide=0;
  const s=slides[B.slide],latest=latestSnapshotDate();
  const liveSlide=['people','attendance','status'].includes(s.key);
  const salesSlide=['pulse','performance','mtd','trend'].includes(s.key);
  const boardroomBadge=liveSlide?'LIVE':(salesSlide?'MTD SALES':'BOARDROOM');
  const boardroomBadgeTone=liveSlide?'var(--green)':(salesSlide?'var(--amber)':'var(--muted)');
  const dots=slides.map((_,i)=>'<button type="button" data-boardroom-slide="'+i+'" aria-label="Slide '+(i+1)+'" style="width:'+(i===B.slide?'30':'9')+'px;height:9px;border:0;border-radius:999px;padding:0;cursor:pointer;background:'+(i===B.slide?'var(--amber)':'var(--line)')+';"></button>').join('');
  return '<style>'
    +'#boardroom-shell{min-height:calc(100vh - 80px);background:var(--bg);color:var(--text);border-radius:14px;padding:18px;position:relative;overflow:hidden;box-sizing:border-box;}'
    +'#boardroom-shell:fullscreen{height:100vh;min-height:100vh;border-radius:0;padding:22px 28px;background:var(--bg);}'
    +'#boardroom-shell.boardroom-mobile-presentation{position:fixed;inset:0;z-index:999999;min-height:100dvh;height:100dvh;border-radius:0;padding:max(12px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));overflow:hidden;background:var(--bg);box-sizing:border-box;}'
    +'#boardroom-shell .boardroom-stage{transform-origin:top left;width:100%;}'
    +'#boardroom-shell.boardroom-mobile-presentation .boardroom-content,#boardroom-shell:fullscreen .boardroom-content{max-height:none;overflow:visible;}'
    +'#boardroom-shell table{font-size:14px;}'
    +'#boardroom-shell .boardroom-title{font-size:36px;line-height:1.05;font-weight:950;letter-spacing:-.02em;}'
    +'#boardroom-shell:fullscreen .boardroom-title{font-size:44px;}'
    +'@media(max-width:900px){#boardroom-shell .boardroom-title{font-size:28px;}#boardroom-shell [style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;}#boardroom-shell [style*="grid-template-columns:repeat(2"]{grid-template-columns:1fr!important;}}'
    +'</style>'
    +'<div id="boardroom-shell"><div class="boardroom-stage">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px;">'
      +'<div><div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">'+pill(boardroomBadge,boardroomBadgeTone)+'<span style="font-size:12px;color:var(--muted);">North East Auto Services · Boardroom</span></div><div class="boardroom-title">'+e(s.title)+'</div><div style="font-size:14px;color:var(--muted);margin-top:6px;">'+e(s.kicker)+'</div></div>'
      +'<div style="text-align:right;"><div id="boardroom-clock" class="mono" style="font-size:26px;font-weight:900;">'+e(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+e(new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))+'</div><div style="font-size:10px;color:var(--muted-2);margin-top:4px;">'+(latest?'MTD sales through '+e(fmt(latest)):'Waiting for sales data')+'</div></div>'
    +'</div>'
    +'<div class="boardroom-content">'+s.html+'</div>'
    +'<div class="no-print" style="display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:12px;border-top:1px solid var(--line);">'
      +'<div style="display:flex;gap:5px;align-items:center;">'+dots+'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-left:4px;">'+(B.slide+1)+' / '+slides.length+'</div>'
      +'<button type="button" class="add-btn" data-boardroom-prev style="margin-left:auto;">‹ Previous</button>'
      +'<button type="button" class="add-btn" data-boardroom-pause>'+(B.paused?'▶ Resume':'Ⅱ Pause')+'</button>'
      +'<button type="button" class="add-btn" data-boardroom-next>Next ›</button>'
      +(B.mobilePresentation?'<button type="button" class="add-btn" data-boardroom-exit>Exit presentation</button>':'')
    +'</div>'
    +'</div></div>';
}

function renderPanel(){
  if(!isTony())return '<div class="card" style="color:var(--red);">Boardroom Presentation is currently available to Tony only.</div>';
  ensureState();
  const desired=['day',today(),today(),today().slice(0,7)].join('|');
  const model=(R.cache&&R.cache.key===desired)?currentModel():null;
  const loading=R.cache&&R.cache.busy&&!model;
  const err=(R.cache&&R.cache.error)||B.lastError;
  const controls='<div class="card no-print" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:12px 14px;">'
    +'<div style="margin-right:auto;"><b>Boardroom Presentation</b><div style="font-size:11px;color:var(--muted);margin-top:3px;">Live workshop overview. The Live site status slide can show staff names and clock status; pay rates and sensitive HR details are never shown.</div></div>'
    +'<label style="font-size:11px;color:var(--muted);">Change slide every<select id="boardroom-speed" style="min-width:110px;"><option value="15" '+(state.admin.boardroomSpeed==15?'selected':'')+'>15 sec</option><option value="20" '+(state.admin.boardroomSpeed==20?'selected':'')+'>20 sec</option><option value="30" '+(state.admin.boardroomSpeed==30?'selected':'')+'>30 sec</option><option value="60" '+(state.admin.boardroomSpeed==60?'selected':'')+'>60 sec</option></select></label>'
    +slidePickerHtml()
    +'<button type="button" class="add-btn" data-boardroom-copy-link>Copy direct link</button>'
    +'<button type="button" class="add-btn" data-boardroom-refresh>Refresh now</button>'
    +'<button type="button" class="add-btn" data-boardroom-fullscreen>⛶ Start presentation</button>'
    +'</div>';
  if(loading)return controls+'<div class="card">Loading Boardroom data…</div>';
  if(err&&!model)return controls+'<div class="card" style="color:var(--red);"><b>Presentation data could not load</b><div style="margin-top:6px;">'+e(err)+'</div></div>';
  if(!model)return controls+'<div class="card">Preparing presentation…</div>';
  return controls+renderSlide(model);
}

function fitBoardroomToViewport(el){
  if(!el)return;
  const stage=el.querySelector('.boardroom-stage');if(!stage)return;
  stage.style.zoom='1';
  const presenting=!!B.mobilePresentation||document.fullscreenElement===el;
  if(!presenting)return;
  requestAnimationFrame(()=>{
    stage.style.zoom='1';
    const availableH=Math.max(1,el.clientHeight-4);
    const availableW=Math.max(1,el.clientWidth-4);
    const neededH=Math.max(1,stage.scrollHeight);
    const neededW=Math.max(1,stage.scrollWidth);
    const scale=Math.min(1,availableH/neededH,availableW/neededW);
    stage.style.zoom=String(Math.max(.58,scale));
  });
}

function applyPresentationState(el){
  if(!el)return;
  el.classList.toggle('boardroom-mobile-presentation',!!B.mobilePresentation);
  document.documentElement.style.overflow=B.mobilePresentation?'hidden':'';
  document.body.style.overflow=B.mobilePresentation?'hidden':'';
  fitBoardroomToViewport(el);
}

function refreshShell(){
  if(state.admin.tab!==TAB)return;
  const model=currentModel(),live=document.getElementById('boardroom-shell');
  if(model&&live){
    const wrap=document.createElement('div');wrap.innerHTML=renderSlide(model);
    const fresh=wrap.querySelector('#boardroom-shell');
    if(fresh){live.innerHTML=fresh.innerHTML;applyPresentationState(live);return}
  }
  if(typeof render==='function')render();
  setTimeout(()=>applyPresentationState(document.getElementById('boardroom-shell')),0);
}

async function load(force){
  if(!isTony())return;
  state.admin.reportPeriodMode='day';
  state.admin.reportPeriodDate=today();
  state.admin.reportPeriodSite='all';
  B.lastError='';
  try{
    await R.load(!!force);
    B.lastLoaded=new Date().toISOString();
  }catch(err){
    B.lastError=err&&err.message?err.message:String(err);
  }
  if(state.admin.tab===TAB)refreshShell();
}

function clearTimers(){
  if(B.timer){clearInterval(B.timer);B.timer=null}
  if(B.refreshTimer){clearInterval(B.refreshTimer);B.refreshTimer=null}
  if(B.attendanceTimer){clearInterval(B.attendanceTimer);B.attendanceTimer=null}
  if(B.clockTimer){clearInterval(B.clockTimer);B.clockTimer=null}
}

function ensureTimers(){
  ensureState();
  clearTimers();
  const speed=Math.max(10,Number(state.admin.boardroomSpeed)||20)*1000;
  B.timer=setInterval(()=>{
    if(state.admin.tab!==TAB){clearTimers();return}
    if(B.paused)return;
    const model=currentModel();if(!model)return;
    const count=slidesFor(model).length;
    B.slide=(B.slide+1)%count;
    refreshShell();
  },speed);
  B.refreshTimer=setInterval(()=>{
    if(state.admin.tab!==TAB){clearTimers();return}
    load(true);
  },300000);
  B.attendanceTimer=setInterval(()=>{
    if(state.admin.tab!==TAB){clearTimers();return}
    loadAttendance();
  },5000);
  B.clockTimer=setInterval(()=>{
    if(state.admin.tab!==TAB){clearTimers();return}
    const el=document.getElementById('boardroom-clock');
    if(el)el.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  },1000);
}

async function loadAttendance(){
  if(!isTony()||B.attendanceBusy)return;
  B.attendanceBusy=true;
  try{
    const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/manager_boardroom_clock_events',{
      method:'POST',
      headers:await authHeaders(),
      body:'{}',
      cache:'no-store'
    });
    if(!res.ok)throw new Error('Live attendance '+res.status);
    const fresh=await res.json();
    if(Array.isArray(fresh))B.liveEvents=fresh;
    B.attendanceLoadedAt=new Date().toISOString();
    if(state.admin.tab===TAB){
      const model=currentModel();
      if(model){
        const slides=slidesFor(model);
        const current=slides[B.slide];
        if(current&&['pulse','people','attendance','status'].includes(current.key))refreshShell();
      }
    }
  }catch(err){
    console.error('Boardroom attendance refresh failed',err);
  }finally{
    B.attendanceBusy=false;
  }
}

async function requestWakeLock(){
  if('wakeLock' in navigator){
    try{B.wakeLock=await navigator.wakeLock.request('screen')}catch(_e){}
  }
}

function startMobilePresentation(){
  B.mobilePresentation=true;
  applyPresentationState(document.getElementById('boardroom-shell'));
}

async function exitPresentation(){
  B.mobilePresentation=false;
  applyPresentationState(document.getElementById('boardroom-shell'));
  if(document.fullscreenElement&&document.exitFullscreen){
    try{await document.exitFullscreen()}catch(_e){}
  }
  if(B.wakeLock){try{await B.wakeLock.release()}catch(_e){}B.wakeLock=null}
}

async function fullscreen(){
  const el=document.getElementById('boardroom-shell');
  B.mobilePresentation=false;
  applyPresentationState(el);
  let nativeStarted=false;
  try{
    if(el&&typeof el.requestFullscreen==='function'){
      if(document.fullscreenElement!==el)await el.requestFullscreen();
      nativeStarted=document.fullscreenElement===el;
    }
  }catch(_e){
    nativeStarted=false;
  }
  if(!nativeStarted)startMobilePresentation();
  await requestWakeLock();
  B.paused=false;ensureTimers();
}

try{
  if(!ADMIN_TAB_OPTIONS.some(x=>x[0]===TAB)){
    const at=ADMIN_TAB_OPTIONS.findIndex(x=>x[0]==='audit');
    ADMIN_TAB_OPTIONS.splice(at>=0?at:ADMIN_TAB_OPTIONS.length,0,[TAB,'Boardroom','Reports']);
  }
  ensureState();
  if(typeof renderAdmin==='function'){
    const old=renderAdmin;
    renderAdmin=function(){
      const html=old();
      if(!state.admin||state.admin.tab!==TAB)return html;
      const wrap=document.createElement('div');wrap.innerHTML=html;
      const main=wrap.querySelector('.admin-main');if(!main)return html;
      const top=main.querySelector('.admin-topbar');
      main.innerHTML=(top?top.outerHTML:'')+renderPanel();
      setTimeout(()=>{
        if(state.admin.tab!==TAB)return;
        const key=[state.admin.reportPeriodMode,state.admin.reportPeriodDate].join('|');
        if(!R.cache.data||R.cache.key!==['day',today(),today(),today().slice(0,7)].join('|'))load(false);
        loadAttendance();
        ensureTimers();
      },0);
      return wrap.innerHTML;
    };
  }
}catch(err){console.error('Boardroom presentation setup failed',err)}

document.addEventListener('change',ev=>{
  const t=ev.target;if(!t||state.admin.tab!==TAB)return;
  if(t.id==='boardroom-speed'){
    state.admin.boardroomSpeed=Math.max(10,Number(t.value)||20);
    saveBoardroomPrefs();
    ensureTimers();
    return;
  }
  if(t.hasAttribute('data-boardroom-slide-toggle')){
    const key=String(t.getAttribute('data-boardroom-slide-toggle')||'');
    if(!BOARDROOM_SLIDE_LABELS[key])return;
    state.admin.boardroomSlides[key]=!!t.checked;
    if(enabledSlideCount()===0){
      state.admin.boardroomSlides[key]=true;
      t.checked=true;
      try{showToast('Keep at least one Boardroom slide selected.',true)}catch(_e){}
      return;
    }
    if(key==='stock')state.admin.boardroomShowStock=state.admin.boardroomSlides.stock!==false;
    saveBoardroomPrefs();
    B.slide=0;
    refreshShell();
    ensureTimers();
  }
},true);

document.addEventListener('click',ev=>{
  const t=ev.target&&ev.target.closest?ev.target.closest('[data-boardroom-fullscreen],[data-boardroom-refresh],[data-boardroom-prev],[data-boardroom-next],[data-boardroom-pause],[data-boardroom-slide],[data-boardroom-exit],[data-boardroom-copy-link]'):null;
  if(!t||state.admin.tab!==TAB)return;
  ev.preventDefault();
  if(t.hasAttribute('data-boardroom-fullscreen')){fullscreen();return}
  if(t.hasAttribute('data-boardroom-exit')){exitPresentation();refreshShell();return}
  if(t.hasAttribute('data-boardroom-copy-link')){copyBoardroomLink();return}
  if(t.hasAttribute('data-boardroom-refresh')){load(true);return}
  const model=currentModel();if(!model)return;
  const count=slidesFor(model).length;
  if(t.hasAttribute('data-boardroom-prev'))B.slide=(B.slide-1+count)%count;
  else if(t.hasAttribute('data-boardroom-next'))B.slide=(B.slide+1)%count;
  else if(t.hasAttribute('data-boardroom-pause'))B.paused=!B.paused;
  else if(t.hasAttribute('data-boardroom-slide'))B.slide=Math.max(0,Math.min(count-1,Number(t.getAttribute('data-boardroom-slide'))||0));
  refreshShell();
  ensureTimers();
},true);


function openDirectBoardroomWhenReady(){
  if(!B.directRequested)return;
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(tries>80){clearInterval(timer);return}
    if(typeof state==='undefined'||!state.admin)return;
    if(state.view==='loading')return;
    if(_session&&isTony()){
      clearInterval(timer);
      state.admin.tab=TAB;
      state.view='admin';
      if(typeof render==='function')render();
      return;
    }
    if(!_session&&state.view!=='admin-pin'){
      state.admin.pin='';
      state.admin.error='';
      state.view='admin-pin';
      if(typeof render==='function')render();
    }
  },250);
}

try{
  if(B.directRequested&&typeof submitManagerLogin==='function'){
    const oldSubmitManagerLogin=submitManagerLogin;
    submitManagerLogin=async function(){
      await oldSubmitManagerLogin();
      if(B.directRequested&&_session&&isTony()&&!state.admin.forcePasswordChange){
        state.admin.tab=TAB;
        state.view='admin';
        if(typeof render==='function')render();
      }
    };
  }
}catch(_e){}

openDirectBoardroomWhenReady();

document.addEventListener('fullscreenchange',()=>{
  const el=document.getElementById('boardroom-shell');
  if(el)setTimeout(()=>fitBoardroomToViewport(el),50);
  if(!document.fullscreenElement&&!B.mobilePresentation&&B.wakeLock){try{B.wakeLock.release()}catch(_e){}B.wakeLock=null}
});

window.addEventListener('resize',()=>{
  if(state.admin&&state.admin.tab===TAB){
    const el=document.getElementById('boardroom-shell');
    if(el)setTimeout(()=>fitBoardroomToViewport(el),50);
  }
});

window.addEventListener('pagehide',()=>{
  B.mobilePresentation=false;
  document.documentElement.style.overflow='';
  document.body.style.overflow='';
});

})();