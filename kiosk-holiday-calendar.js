/* Site-scoped, read-only staff holiday kiosk. Manager enrolment is required. */
(function(){
'use strict';
const KEY='sb_kiosk_holiday_grant_v1', VIEW='kiosk-holidays';
const S={month:toMonth(new Date()),rows:[],selected:'',busy:false,error:'',refreshed:'',seq:0,pendingLogin:false};
function toMonth(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function grant(){try{const g=JSON.parse(localStorage.getItem(KEY)||'null');return g&&g.siteId===getKioskSite()&&/^[0-9a-f]{64}$/.test(g.token||'')?g:null;}catch(_){return null;}}
function manager(){return !!(state.admin&&state.admin.authed&&typeof _session!=='undefined'&&_session);}
function redraw(){if(state.view===VIEW)render();}
function niceMonth(){const [y,m]=S.month.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{year:'numeric',month:'long'});}
function niceDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});}
function amount(e){const n=Number(e.amount);return e.unit==='hours'?' · '+n.toLocaleString('en-GB')+' hours':n<1?' · ½ day':'';}
async function rpc(fn,payload,signed){
 const headers=signed?await authHeaders():{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'};
 const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers,body:JSON.stringify(payload)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.message||'Could not connect to holiday calendar');
 return data;
}
async function load(){
 const g=grant(), siteId=getKioskSite(), req=++S.seq,month=S.month;
 S.rows=[];S.error='';S.refreshed='';
 if(!g||!siteId){S.busy=false;redraw();return;}
 S.busy=true;redraw();
 try{
  const d=await rpc('kiosk_holidays_month',{p_site_id:siteId,p_token:g.token,p_month:month},false);
  if(req!==S.seq||state.view!==VIEW||siteId!==getKioskSite())return;
  if(!d||!d.ok||d.siteId!==siteId||d.month!==month)throw new Error((d&&d.error)||'Kiosk authorisation failed');
  S.rows=Array.isArray(d.entries)?d.entries:[];S.refreshed=d.updatedAt||'';
 }catch(e){if(req!==S.seq)return;S.rows=[];S.error=e.message||'Calendar unavailable';}
 finally{if(req===S.seq){S.busy=false;redraw();}}
}
function open(){S.month=toMonth(new Date());S.selected='';state.view=VIEW;load();}
function change(delta){const [y,m]=S.month.split('-').map(Number);S.month=toMonth(new Date(y,m-1+delta,1));S.selected='';load();}
function choose(date){S.selected=S.selected===date?'':date;redraw();}
function beginLogin(){S.pendingLogin=true;state.admin.error='';state.view='admin-pin';render();}
function afterLogin(){if(!S.pendingLogin)return false;S.pendingLogin=false;if(state.admin.forcePasswordChange)return false;state.view=VIEW;S.error='';return true;}
async function enrol(){
 if(!manager()){S.error='A site manager must sign in first.';redraw();return;}
 const siteId=getKioskSite();
 if(!siteId||!window.crypto||!crypto.getRandomValues){S.error='Secure setup is unavailable on this kiosk.';redraw();return;}
 S.busy=true;S.error='';redraw();
 try{
  const a=new Uint8Array(32);crypto.getRandomValues(a);const token=Array.from(a,n=>n.toString(16).padStart(2,'0')).join('');
  const r=await rpc('kiosk_holidays_enrol',{p_site_id:siteId,p_token:token},true);
  if(!r||!r.ok||r.siteId!==siteId)throw new Error('Site authorisation was unsuccessful');
  try{localStorage.setItem(KEY,JSON.stringify({siteId,token}));}
  catch(_){await rpc('kiosk_holidays_revoke',{p_token:token},true);throw new Error('Kiosk storage is unavailable');}
  signOutManager(); // Do not leave a manager session open on an unattended kiosk.
  state.view=VIEW;S.selected='';await load();
 }catch(e){S.error=e.message||'Manager authorisation failed';}
 finally{S.busy=false;redraw();}
}
function renderCalendar(){
 const [y,m]=S.month.split('-').map(Number),count=new Date(y,m,0).getDate(),offset=(new Date(y,m-1,1).getDay()+6)%7;
 const byDay=new Map();
 S.rows.forEach(e=>{if(!e||typeof e.date!=='string'||typeof e.name!=='string')return;if(!byDay.has(e.date))byDay.set(e.date,[]);byDay.get(e.date).push(e);});
 const cells=Array.from({length:offset},()=>'<div class="kh-cell kh-empty"></div>');
 for(let n=1;n<=count;n++){
  const date=S.month+'-'+String(n).padStart(2,'0'),names=byDay.get(date)||[];
  cells.push('<button type="button" class="kh-cell'+(S.selected===date?' kh-selected':'')+(date===toMonth(new Date())+'-'+String(new Date().getDate()).padStart(2,'0')?' kh-today':'')+'" data-action="kiosk-holiday-day" data-id="'+date+'" aria-label="'+esc(niceDay(date))+', '+names.length+' colleagues on holiday"><b>'+n+'</b>'+names.slice(0,2).map(e=>'<span class="kh-name">'+esc(e.name)+'</span>').join('')+(names.length>2?'<span class="kh-more">+'+(names.length-2)+' more</span>':'')+'</button>');
 }
 while(cells.length%7)cells.push('<div class="kh-cell kh-empty"></div>');
 const people=S.selected?byDay.get(S.selected)||[]:[];
 const detail=S.selected?'<div class="kh-detail"><strong>'+esc(niceDay(S.selected))+'</strong>'+(people.length?people.map(e=>'<div class="kh-person"><span>'+esc(e.name)+'</span><span>'+esc(amount(e))+'</span></div>').join(''):'<p>No authorised holidays.</p>')+'</div>':'';
 return '<div class="kh-tools"><button type="button" class="action-btn secondary" data-action="kiosk-holiday-prev" aria-label="Previous month">‹</button><h3>'+esc(niceMonth())+'</h3><button type="button" class="action-btn secondary" data-action="kiosk-holiday-next" aria-label="Next month">›</button></div><div class="kh-weekdays">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="kh-grid">'+cells.join('')+'</div>'+detail;
}
function view(){
 const siteId=getKioskSite(),site=siteId?siteName(siteId):'Location not set',g=grant();
 let contents='';
 if(!siteId)contents='<p>Select a kiosk location first.</p>';
 else if(!g)contents='<section class="kh-setup"><h3>Manager setup required</h3><p>To protect employee information, a manager for <b>'+esc(site)+'</b> must authorise this kiosk once. Afterwards staff can view approved holidays without a PIN.</p>'+(manager()?'<button type="button" class="action-btn" data-action="kiosk-holiday-enrol" '+(S.busy?'disabled':'')+'>Enable for this kiosk</button>':'<button type="button" class="action-btn" data-action="kiosk-holiday-login">Manager sign in</button>')+'</section>';
 else contents=renderCalendar();
 const status=S.busy?'<p class="kh-status">Refreshing approved holidays…</p>':S.error?'<p role="alert" class="kh-error">'+esc(S.error)+'</p>':g&&S.refreshed?'<p class="kh-status">Updated '+esc(new Date(S.refreshed).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+' · Approved holidays only · Read-only</p>':'';
 return topstrip()+'<main class="kh-page"><header class="kh-heading"><div><span>'+esc(site)+'</span><h2>Authorised Holidays</h2><p>Approved annual leave for colleagues at this location.</p></div><button type="button" class="action-btn secondary" data-action="kiosk-holiday-back">← Back to kiosk</button></header>'+status+contents+'</main>';
}
const style=document.createElement('style');
style.textContent=[
'.kh-page{width:min(1050px,96%);margin:auto;padding:24px 12px 56px}.kh-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin-bottom:22px}.kh-heading>div>span{color:var(--amber);font-size:12px;font-weight:800;text-transform:uppercase}.kh-heading h2{font-size:28px}.kh-heading p,.kh-setup p{font-size:13px;color:var(--muted)}',
'.kh-tools{display:flex;align-items:center;justify-content:center;gap:18px;margin:12px 0}.kh-tools h3{min-width:160px;text-align:center}.kh-tools button{font-size:22px;min-width:48px}.kh-weekdays,.kh-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.kh-weekdays span{text-align:center;font-size:12px;color:var(--muted);padding:8px 0}',
'.kh-cell{min-width:0;min-height:100px;border:1px solid var(--line);background:var(--panel);padding:7px;display:flex;flex-direction:column;gap:5px;align-items:stretch;text-align:left;color:var(--text);cursor:pointer}.kh-cell.kh-empty{background:transparent;border-color:transparent;cursor:default}.kh-cell.kh-today{border-color:var(--amber)}.kh-cell.kh-selected{outline:2px solid var(--amber)}.kh-cell b{font-size:14px}.kh-name{background:var(--green-dim);color:#a5edc5;padding:3px 5px;border-radius:3px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kh-more{font-size:11px;color:var(--muted)}',
'.kh-setup,.kh-detail{background:var(--panel);border:1px solid var(--line);padding:18px;line-height:1.6}.kh-setup{max-width:670px;margin:20px auto}.kh-setup p{margin:10px 0 18px}.kh-detail{margin-top:18px}.kh-person{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft)}.kh-status{color:var(--muted);font-size:12px}.kh-error{color:var(--red);font-size:13px;font-weight:700}',
'@media(max-width:680px){.kh-page{width:100%;padding:12px 7px 30px}.kh-heading h2{font-size:23px}.kh-weekdays,.kh-grid{gap:2px}.kh-cell{padding:3px;min-height:66px;gap:2px}.kh-cell b{font-size:12px}.kh-name{font-size:9px;padding:2px}.kh-more{font-size:9px}}'
].join('');
document.head.appendChild(style);
setInterval(()=>{if(state.view===VIEW&&grant()&&!S.busy)load();},90000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.view===VIEW&&grant())load();});
window.shiftboardHolidayCalendar={open,change,choose,beginLogin,afterLogin,enrol,view,load};
})();
