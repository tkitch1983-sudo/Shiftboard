(function(){
 'use strict';
 const SITES=[
  ['s1','Seaham','seaham@neautoservices.com'],
  ['s2','Peterlee','peterlee@neautoservices.com'],
  ['s3','Middlesbrough','middlesbrough@neautoservices.com'],
  ['s4','Hartlepool','hartlepool@neautoservices.com'],
  ['s5','Gateshead','gateshead@neautoservices.com'],
  ['s6','Fairfield','fairfield@neautoservices.com'],
  ['s7','Chester-le-Street','chesterlestreet@neautoservices.com'],
  ['s8','Lido','lido@neautoservices.com']
 ];
 const WEEKS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const OXY=['cylinders_upright','cylinder_key','fire_gloves','ppe_suitable',
  'regulators_type_date','connection_nuts','oxygen_regulator_clean','flashback_arrestors',
  'hoses_good','clips_factory','spliced_hoses_checked','torch_condition','nozzle_seated'];
 const CARS=['rubbish','dashboard','centre_console','doors_pockets','steering_wheel','gear_stick',
  'seats_wipe','carpets','seats_hoover','mats','boot_space','outside','wheels_trims','windows','wipers'];
 const M={week:null,month:null,weekly:[],monthly:[],loading:false,error:'',updatedAt:0};
 function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
 function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function period(){
  const d=new Date(), m=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  m.setDate(m.getDate()-((m.getDay()+6)%7));
  return {week:iso(m),month:iso(new Date(d.getFullYear(),d.getMonth(),1))};
 }
 function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
 function loanCarRequired(siteId){return siteId==='s5'||siteId==='s7';}
 function weeklyComplete(r,siteId){
  if(!r||!r.weekly_timesheet_done)return false;
  const days=(r.site_cleaning_form&&r.site_cleaning_form.days)||{};
  const cleaning=WEEKS.every(day=>{
   const d=days[day]||{};
   return ['reception','office','toilets','mess','signature'].every(k=>!!String(d[k]||'').trim());
  });
  if(!cleaning||!(Array.isArray(r.stock_files)&&r.stock_files.length>0))return false;
  const oxy=r.oxy_acetylene_form||{},ans=oxy.answers||{},notes=oxy.item_notes||{};
  if(!String(oxy.completed_by||'').trim()||!OXY.every(k=>!!String(ans[k]||'').trim()))return false;
  const negatives=OXY.filter(k=>ans[k]==='no');
  if(negatives.length && !String(oxy.notes||'').trim() &&
   !negatives.some(k=>!!String(notes[k]||'').trim()))return false;
  if(!loanCarRequired(siteId))return true;
  const car=r.car_cleaning_form||{},cars=Array.isArray(car.cars)?car.cars:[];
  if(car.enabled===false||car.no_cars===true)return true;
  const first=cars[0]||{};
  return !!String(car.completed_by||'').trim() && !!String(first.reg||'').trim() &&
   cars.filter(x=>x&&String(x.reg||'').trim()).every(x=>CARS.every(k=>!!String((x.items||{})[k]||'').trim()));
 }
 function visible(){return typeof state!=='undefined'&&state.admin&&state.admin.role==='super'&&!!state.admin.authed;}
 async function load(force){
  if(!visible()||M.loading)return;
  const {week,month}=period();
  if(!force && M.week===week && M.month===month && M.updatedAt && Date.now()-M.updatedAt<60000)return;
  M.loading=true;M.error='';
  try{
   const heads=await authHeaders();
   const root=SUPABASE_URL+'/rest/v1/';
   const [w,m]=await Promise.all([
    fetch(root+'weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(week),{headers:heads,cache:'no-store'}),
    fetch(root+'monthly_hs_checks?select=site_id,status,published_at&month_start=eq.'+encodeURIComponent(month),{headers:heads,cache:'no-store'})
   ]);
   if(!w.ok||!m.ok)throw new Error('Unable to load checklist records ('+(w.ok?m.status:w.status)+')');
   const [weekly,monthly]=await Promise.all([w.json(),m.json()]);
   if(!Array.isArray(weekly)||!Array.isArray(monthly))throw new Error('Invalid checklist data');
   M.week=week;M.month=month;M.weekly=weekly;M.monthly=monthly;M.updatedAt=Date.now();
  }catch(e){M.error=e&&e.message||'Checklist data unavailable';M.updatedAt=0;}
  finally{M.loading=false;if(visible()&&state.admin.tab==='checkstatus'&&typeof render==='function')render();}
 }
 function rows(){
  const w=new Map(M.weekly.map(r=>[String(r.site_id),r]));
  const m=new Map(M.monthly.map(r=>[String(r.site_id),r]));
  return SITES.map(([id,name,email])=>{
   const weekRecord=w.get(id),monthlyRecord=m.get(id);
   return {id,name,email,week:weeklyComplete(weekRecord,id),
    month:!!monthlyRecord&&monthlyRecord.status==='published',
    weekDraft:!!weekRecord,monthDraft:!!monthlyRecord&&monthlyRecord.status==='draft'};
  });
 }
 function pill(done){return '<span style="display:inline-block;border-radius:7px;padding:6px 9px;font-size:12px;font-weight:800;color:'+
  (done?'#10783f':'#b02525')+';background:'+(done?'#e8f5ec':'#fff0ed')+';">'+(done?'DONE':'NOT DONE')+'</span>';}
 function renderStatus(){
  if(!visible())return '<div class="card">Upper Management access only.</div>';
  const p=period();
  if((M.week!==p.week||M.month!==p.month||!M.updatedAt)&&!M.loading)setTimeout(()=>load(false),0);
  const all=rows(),wd=all.filter(x=>x.week).length,md=all.filter(x=>x.month).length;
  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">'+
   '<div><h2>Checklist Status</h2><div class="head-sub">Upper Management · all eight workshops</div></div>'+
   '<button type="button" class="btn-sm" data-checkstatus-refresh>Refresh</button></div>'+
   '<div style="color:var(--muted);font-size:12px;margin:12px 0;">Week commencing '+
   escapeHtml(dateLabel(p.week))+' · Monthly H&amp;S '+escapeHtml(new Date(p.month+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}))+
   ' · Current periods are still in progress.</div>'+
   (M.error?'<div class="card" style="color:var(--red);">Unable to load current results: '+escapeHtml(M.error)+'</div>':'')+
   (M.loading&&!M.updatedAt?'<div class="card">Loading site checks…</div>':'')+
   '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;">'+
   '<div class="card" style="flex:1;min-width:135px;"><div style="font-size:12px;color:var(--muted);">Weekly Done</div><div style="font-family:Oswald,sans-serif;font-size:27px;font-weight:700;">'+(M.updatedAt?wd+'/8':'—')+'</div></div>'+
   '<div class="card" style="flex:1;min-width:135px;"><div style="font-size:12px;color:var(--muted);">Monthly Done</div><div style="font-family:Oswald,sans-serif;font-size:27px;font-weight:700;">'+(M.updatedAt?md+'/8':'—')+'</div></div></div>'+
   '<div class="card"><div style="font-weight:700;margin-bottom:10px;">Workshop checklist completion</div>'+
   (M.updatedAt?all.map(r=>'<div style="border-top:1px solid var(--line);padding:12px 0;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'+
    '<strong>'+escapeHtml(r.name)+'</strong>'+
    ((!r.week||!r.month)?'<button type="button" class="btn-sm" data-checkstatus-remind="'+escapeHtml(r.id)+'">Email reminder <span style="font-weight:400;">↗</span></button>':'')+'</div>'+
    '<div style="display:flex;gap:9px;margin-top:8px;flex-wrap:wrap;align-items:center;">'+
    '<div style="min-width:123px;"><span style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px;">Weekly</span>'+pill(r.week)+'</div>'+
    '<div style="min-width:123px;"><span style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px;">Monthly H&amp;S</span>'+pill(r.month)+'</div>'+
    (r.weekDraft&&!r.week||r.monthDraft&&!r.month?'<span style="color:var(--muted);font-size:11px;">'+(r.weekDraft&&!r.week?'Weekly incomplete':'')+
      (r.weekDraft&&!r.week&&r.monthDraft&&!r.month?' · ':'')+(r.monthDraft&&!r.month?'Monthly draft':'')+'</span>':'')+'</div></div>').join(''):
   '<div style="color:var(--muted);padding:15px 0;">Loading statuses…</div>')+'</div>'+
   '<div style="font-size:11px;color:var(--muted);line-height:1.6;margin-top:9px;">'+
   'DONE means the weekly form is fully complete, or the monthly H&amp;S inspection is published. '+
   'NOT DONE also includes draft and missing forms. Staff acknowledgements are tracked separately. '+
   'Email reminder opens a pre-addressed message for you to review and send; it does not send automatically.</div>';
 }
 function reminder(siteId){
  if(!visible()||!M.updatedAt)return;
  const r=rows().find(x=>x.id===siteId);if(!r||r.week&&r.month)return;
  const items=[!r.week?'weekly workshop checks':'',!r.month?'monthly H&S checks':''].filter(Boolean);
  const body='Hello '+r.name+' team,\n\nShiftboard shows the following as NOT DONE:\n\n'+
   items.map(a=>'- '+a).join('\n')+'\n\nPlease complete the outstanding checks in Shiftboard and let Upper Management know when they are done.\n\n'+
   'Weekly period: '+dateLabel(M.week)+'\nMonthly period: '+new Date(M.month+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'})+
   '\n\nThank you,\nUpper Management\n';
  window.location.href='mailto:'+r.email+'?subject='+encodeURIComponent('Shiftboard checklist reminder - '+r.name)+
   '&body='+encodeURIComponent(body);
 }
 document.addEventListener('click',e=>{
  const refresh=e.target.closest&&e.target.closest('[data-checkstatus-refresh]');
  if(refresh&&visible()){e.preventDefault();load(true);return;}
  const button=e.target.closest&&e.target.closest('[data-checkstatus-remind]');
  if(button&&visible()){e.preventDefault();reminder(button.getAttribute('data-checkstatus-remind'));}
 });
 window.NEASChecklistStatus={render:renderStatus,load};
})();