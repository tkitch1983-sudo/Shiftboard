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
  clockTimer:null,
  wakeLock:null,
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

function ensureState(){
  if(!state.admin.boardroomSpeed)state.admin.boardroomSpeed=20;
  if(state.admin.boardroomShowStock===undefined)state.admin.boardroomShowStock=true;
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

function pulseSlide(model){
  const sites=model.sites;
  const sales=sites.reduce((a,s)=>a+n(s.sales),0),target=sites.reduce((a,s)=>a+n(s.target),0),variance=sales-target;
  const staffWorking=sites.reduce((a,s)=>a+s.people.filter(x=>n(x.hours)>0).length,0);
  const hours=sites.reduce((a,s)=>a+n(s.hours),0);
  const sick=sites.reduce((a,s)=>a+n(s.sick),0);
  const holidays=sites.reduce((a,s)=>a+n(s.holiday),0);
  const issues=sites.reduce((a,s)=>a+siteIssues(s,model.p).length,0);
  const latest=latestSnapshotDate();
  return {
    title:'Business pulse',
    kicker:'Today across the workshop group',
    html:'<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;">'
      +metric('Sales',money(sales),latest?'Sales data through '+fmt(latest):'No sales snapshot yet')
      +metric('Target',target?money(target):'—','Today’s workshop target')
      +metric('Variance',target?((variance>=0?'+':'')+money(variance)):'—',target?(sales>=target?'At or above target':'Behind target'):'No target set',target?statusTone(sales,target):'var(--muted)')
      +metric('People working',String(staffWorking),dec(hours,1)+' recorded paid hours')
      +metric('Sickness',String(sick),'Workdays recorded',sick?'var(--amber)':'var(--green)')
      +metric('Holiday',dec(holidays,1),'Approved days today')
      +metric('Items to review',String(issues),'Operational / compliance',issues?'var(--red)':'var(--green)')
      +metric('Workshops',String(sites.length),'Workshop reporting only')
      +'</div>'
  };
}

function performanceSlide(model){
  const cards=model.sites.slice().sort((a,b)=>{
    const av=a.target?((a.sales-a.target)/a.target):0,bv=b.target?((b.sales-b.target)/b.target):0;
    return av-bv;
  }).map(s=>{
    const v=n(s.sales)-n(s.target),att=s.target?s.sales/s.target*100:null,issues=siteIssues(s,model.p).length;
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:1.4fr .9fr .9fr .8fr;align-items:center;gap:14px;">'
      +'<div><div style="font-size:19px;font-weight:900;">'+e(s.name)+'</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">'+(att==null?pill('No target','var(--muted)'):pill(att.toFixed(1)+'% of target',att>=100?'var(--green)':'var(--red)'))+(issues?pill(issues+' issue'+(issues===1?'':'s'),'var(--red)'):pill('No issues','var(--green)'))+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">Sales</div><div class="mono" style="font-size:24px;font-weight:900;">'+money(s.sales)+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">Variance</div><div class="mono" style="font-size:24px;font-weight:900;color:'+(s.target?(v<0?'var(--red)':'var(--green)'):'var(--muted)')+';">'+(s.target?((v>=0?'+':'')+money(v)):'—')+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:800;">Margin</div><div class="mono" style="font-size:22px;font-weight:900;">'+pct(s.margin)+'</div></div>'
      +'</div>';
  }).join('');
  return {title:'Workshop performance',kicker:'Sales, target and margin by site',html:'<div style="display:grid;gap:10px;">'+cards+'</div>'};
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
  const cards=model.sites.map(s=>{
    const working=s.people.filter(x=>n(x.hours)>0).length,issues=n(s.auto),missing=s.people.filter(x=>x.payRate==null).length;
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;"><div><div style="font-size:18px;font-weight:900;">'+e(s.name)+'</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+s.people.length+' active staff assigned</div></div>'+pill(working+' working',working?'var(--green)':'var(--muted)')+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;"><div><small style="color:var(--muted);">Hours</small><div class="mono" style="font-size:21px;font-weight:800;">'+dec(s.hours,1)+'</div></div><div><small style="color:var(--muted);">Sick</small><div class="mono" style="font-size:21px;font-weight:800;color:'+(s.sick?'var(--amber)':'var(--text)')+';">'+s.sick+'</div></div><div><small style="color:var(--muted);">Holiday</small><div class="mono" style="font-size:21px;font-weight:800;">'+dec(s.holiday,1)+'</div></div><div><small style="color:var(--muted);">Auto-close</small><div class="mono" style="font-size:21px;font-weight:800;color:'+(issues?'var(--red)':'var(--text)')+';">'+issues+'</div></div></div>'
      +(missing?'<div style="font-size:11px;color:var(--amber);margin-top:10px;">'+missing+' workshop pay rate'+(missing===1?'':'s')+' missing</div>':'')
      +'</div>';
  }).join('');
  return {title:'People today',kicker:'Workshop staffing and attendance — no individual employee details shown',html:'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'+cards+'</div>'};
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
  const arr=[pulseSlide(model),performanceSlide(model),trendSlide(model),peopleSlide(model),actionsSlide(model)];
  if(state.admin.boardroomShowStock!==false)arr.push(stockSlide(model));
  return arr;
}

function renderSlide(model){
  ensureState();
  const slides=slidesFor(model);
  if(B.slide>=slides.length)B.slide=0;
  const s=slides[B.slide],latest=latestSnapshotDate();
  const dots=slides.map((_,i)=>'<button type="button" data-boardroom-slide="'+i+'" aria-label="Slide '+(i+1)+'" style="width:'+(i===B.slide?'30':'9')+'px;height:9px;border:0;border-radius:999px;padding:0;cursor:pointer;background:'+(i===B.slide?'var(--amber)':'var(--line)')+';"></button>').join('');
  return '<style>'
    +'#boardroom-shell{min-height:calc(100vh - 80px);background:var(--bg);color:var(--text);border-radius:14px;padding:18px;position:relative;overflow:hidden;}'
    +'#boardroom-shell:fullscreen{min-height:100vh;border-radius:0;padding:26px 34px;background:var(--bg);}'
    +'#boardroom-shell table{font-size:14px;}'
    +'#boardroom-shell .boardroom-title{font-size:36px;line-height:1.05;font-weight:950;letter-spacing:-.02em;}'
    +'#boardroom-shell:fullscreen .boardroom-title{font-size:48px;}'
    +'#boardroom-shell:fullscreen .boardroom-content{max-height:calc(100vh - 190px);overflow:auto;}'
    +'@media(max-width:900px){#boardroom-shell .boardroom-title{font-size:28px;}#boardroom-shell [style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;}#boardroom-shell [style*="grid-template-columns:repeat(2"]{grid-template-columns:1fr!important;}}'
    +'</style>'
    +'<div id="boardroom-shell">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px;">'
      +'<div><div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">'+pill('LIVE','var(--green)')+'<span style="font-size:12px;color:var(--muted);">North East Auto Services · Boardroom</span></div><div class="boardroom-title">'+e(s.title)+'</div><div style="font-size:14px;color:var(--muted);margin-top:6px;">'+e(s.kicker)+'</div></div>'
      +'<div style="text-align:right;"><div id="boardroom-clock" class="mono" style="font-size:26px;font-weight:900;">'+e(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">'+e(new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))+'</div><div style="font-size:10px;color:var(--muted-2);margin-top:4px;">'+(latest?'Sales data through '+e(fmt(latest)):'Waiting for sales data')+'</div></div>'
    +'</div>'
    +'<div class="boardroom-content">'+s.html+'</div>'
    +'<div class="no-print" style="display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:12px;border-top:1px solid var(--line);">'
      +'<div style="display:flex;gap:5px;align-items:center;">'+dots+'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-left:4px;">'+(B.slide+1)+' / '+slides.length+'</div>'
      +'<button type="button" class="add-btn" data-boardroom-prev style="margin-left:auto;">‹ Previous</button>'
      +'<button type="button" class="add-btn" data-boardroom-pause>'+(B.paused?'▶ Resume':'Ⅱ Pause')+'</button>'
      +'<button type="button" class="add-btn" data-boardroom-next>Next ›</button>'
    +'</div>'
    +'</div>';
}

function renderPanel(){
  if(!isTony())return '<div class="card" style="color:var(--red);">Boardroom Presentation is currently available to Tony only.</div>';
  ensureState();
  const desired=['day',today(),today(),today().slice(0,7)].join('|');
  const model=(R.cache&&R.cache.key===desired)?currentModel():null;
  const loading=R.cache&&R.cache.busy&&!model;
  const err=(R.cache&&R.cache.error)||B.lastError;
  const controls='<div class="card no-print" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:12px 14px;">'
    +'<div style="margin-right:auto;"><b>Boardroom Presentation</b><div style="font-size:11px;color:var(--muted);margin-top:3px;">Live workshop overview. Sensitive employee-level and pay-rate details are not shown.</div></div>'
    +'<label style="font-size:11px;color:var(--muted);">Change slide every<select id="boardroom-speed" style="min-width:110px;"><option value="15" '+(state.admin.boardroomSpeed==15?'selected':'')+'>15 sec</option><option value="20" '+(state.admin.boardroomSpeed==20?'selected':'')+'>20 sec</option><option value="30" '+(state.admin.boardroomSpeed==30?'selected':'')+'>30 sec</option><option value="60" '+(state.admin.boardroomSpeed==60?'selected':'')+'>60 sec</option></select></label>'
    +'<button type="button" class="add-btn" data-boardroom-refresh>Refresh now</button>'
    +'<button type="button" class="add-btn" data-boardroom-fullscreen>⛶ Start presentation</button>'
    +'</div>';
  if(loading)return controls+'<div class="card">Loading today’s boardroom data…</div>';
  if(err&&!model)return controls+'<div class="card" style="color:var(--red);"><b>Presentation data could not load</b><div style="margin-top:6px;">'+e(err)+'</div></div>';
  if(!model)return controls+'<div class="card">Preparing presentation…</div>';
  return controls+renderSlide(model);
}

function refreshShell(){
  if(state.admin.tab!==TAB)return;
  const model=currentModel(),live=document.getElementById('boardroom-shell');
  if(model&&live){
    const wrap=document.createElement('div');wrap.innerHTML=renderSlide(model);
    const fresh=wrap.querySelector('#boardroom-shell');
    if(fresh){live.innerHTML=fresh.innerHTML;return}
  }
  if(typeof render==='function')render();
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
  B.clockTimer=setInterval(()=>{
    if(state.admin.tab!==TAB){clearTimers();return}
    const el=document.getElementById('boardroom-clock');
    if(el)el.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  },1000);
}

async function fullscreen(){
  const el=document.getElementById('boardroom-shell');
  try{
    if(el&&document.fullscreenElement!==el)await el.requestFullscreen();
    if('wakeLock' in navigator){
      try{B.wakeLock=await navigator.wakeLock.request('screen')}catch(_e){}
    }
  }catch(err){
    try{showToast('Full screen could not start. Use the browser full-screen control.',true)}catch(_e){}
  }
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
    ensureTimers();
  }
},true);

document.addEventListener('click',ev=>{
  const t=ev.target&&ev.target.closest?ev.target.closest('[data-boardroom-fullscreen],[data-boardroom-refresh],[data-boardroom-prev],[data-boardroom-next],[data-boardroom-pause],[data-boardroom-slide]'):null;
  if(!t||state.admin.tab!==TAB)return;
  ev.preventDefault();
  if(t.hasAttribute('data-boardroom-fullscreen')){fullscreen();return}
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

document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement&&B.wakeLock){try{B.wakeLock.release()}catch(_e){}B.wakeLock=null}
});

})();