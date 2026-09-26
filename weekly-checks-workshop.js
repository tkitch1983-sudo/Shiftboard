(function(){
  'use strict';

  const TAB_KEY='weeklychecks';
  const BUCKET='weekly-checks';
  const MAX_FILE_BYTES=20*1024*1024;
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp','csv','xls','xlsx']);
  const NON_WORKSHOP_IDS=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']);
  const currentCache=new Map();
  const historyCache=new Map();
  const loadingCurrent=new Set();
  const loadingHistory=new Set();
  let saving=false;

  const CAR_ITEMS=[
    ['rubbish','Interior','Clean out any rubbish'],
    ['dashboard','Interior · Wipe down','Dashboard'],
    ['centre_console','Interior · Wipe down','Centre console'],
    ['doors_pockets','Interior · Wipe down','Door & door pockets'],
    ['steering_wheel','Interior · Wipe down','Steering wheel'],
    ['gear_stick','Interior · Wipe down','Gear stick'],
    ['seats_wipe','Interior · Wipe down','Seats'],
    ['carpets','Interior · Hoover','Carpets'],
    ['seats_hoover','Interior · Hoover','Seats'],
    ['mats','Interior · Hoover','Mats'],
    ['boot_space','Interior · Hoover','Boot space'],
    ['outside','Exterior · Wash','Outside of vehicle'],
    ['wheels_trims','Exterior · Wash','Wheels & wheel trims'],
    ['windows','Exterior · Wash','Windows'],
    ['wipers','Exterior · Wash','Wipers']
  ];

  const OXY_ITEMS=[
    ['cylinders_upright','Gas Cylinders','Are the cylinders secured in a carrier in the upright position?'],
    ['cylinder_key','Gas Cylinders','Is a cylinder key available?'],
    ['fire_gloves','PPE','Are fire retardant gloves to hand?'],
    ['ppe_suitable','PPE','Is suitable PPE available?'],
    ['regulators_type_date','Regulators','Are regulators the correct type, in good order and is the tag in date?'],
    ['connection_nuts','Regulators','Are connection nuts in good order?'],
    ['oxygen_regulator_clean','Regulators','Is the oxygen regulator free from grease and oil?'],
    ['flashback_arrestors','Regulators','Are flash back arrestors fitted?'],
    ['hoses_good','Hoses','Are hoses in good order?'],
    ['clips_factory','Hoses','Are clips factory fitted (not jubilee clips etc)?'],
    ['spliced_hoses_checked','Hoses','Spliced hoses checked (if applicable)'],
    ['torch_condition','Cutting torch / welding torch','Is the torch suitable and in good condition with no leaks from valves, shank, mixer or connections?'],
    ['nozzle_seated','Cutting torch / welding torch','Is the nozzle seated correctly?']
  ];

  const CLEAN_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const CLEAN_AREAS=[
    ['reception','Reception Area','hoover / mop floors / windows / door / chairs etc'],
    ['office','Office','desks / floors / chairs / doors / handles / light switches etc'],
    ['toilets','Toilets','taps / toilets / doors / sinks / floors etc'],
    ['mess','Mess Room','tables / chairs / work surfaces / floors etc']
  ];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function sites(){return ((state.config&&state.config.sites)||[]).slice();}
  function siteFor(id){return sites().find(function(s){return String(s.id)===String(id);});}
  function isWorkshop(site){
    if(!site) return false;
    const id=String(site.id||''), name=String(site.name||'').toLowerCase();
    return !NON_WORKSHOP_IDS.has(id) && !/petrol|filling station|floaters|upper management/.test(name) && name!=='great ayton';
  }
  function workshopSites(){return sites().filter(isWorkshop).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});}
  function currentSiteId(){
    if(!state.admin) return '';
    return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
  }
  function isoLocal(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
  function mondayIso(){const d=new Date(),diff=(d.getDay()+6)%7;d.setHours(12,0,0,0);d.setDate(d.getDate()-diff);return isoLocal(d);}
  function fmtDate(v){if(!v)return '—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
  function fmtDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  function fileExt(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
  function cleanName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
  function storagePath(path){return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');}
  function mimeFor(file){
    if(file.type)return file.type;
    const e=fileExt(file.name);
    if(e==='pdf')return 'application/pdf';if(e==='jpg'||e==='jpeg')return 'image/jpeg';if(e==='png')return 'image/png';if(e==='webp')return 'image/webp';if(e==='csv')return 'text/csv';if(e==='xls')return 'application/vnd.ms-excel';if(e==='xlsx')return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';return 'application/octet-stream';
  }
  function jsonObj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}

  async function fetchCurrent(siteId){
    if(!siteId)return null;
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
    const res=await fetch(url,{headers,cache:'no-store'});
    if(!res.ok)throw new Error('Weekly checks '+res.status);
    const rows=await res.json(),row=rows[0]||null;
    currentCache.set(String(siteId),row);
    return row;
  }

  async function fetchHistory(siteId){
    if(!siteId)return [];
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&order=week_start.desc&limit=26';
    const res=await fetch(url,{headers,cache:'no-store'});
    if(!res.ok)throw new Error('Weekly history '+res.status);
    const rows=await res.json();
    historyCache.set(String(siteId),rows);
    return rows;
  }

  function scheduleLoads(siteId){
    if(!siteId)return;
    if(!currentCache.has(siteId)&&!loadingCurrent.has(siteId)){
      loadingCurrent.add(siteId);
      setTimeout(function(){fetchCurrent(siteId).catch(function(){}).finally(function(){loadingCurrent.delete(siteId);try{render();}catch(_e){}});},0);
    }
    if(!historyCache.has(siteId)&&!loadingHistory.has(siteId)){
      loadingHistory.add(siteId);
      setTimeout(function(){fetchHistory(siteId).catch(function(){}).finally(function(){loadingHistory.delete(siteId);try{render();}catch(_e){}});},0);
    }
  }

  function statusSelect(id,val){
    val=String(val||'');
    return '<select id="'+esc(id)+'" style="min-width:88px;"><option value="">Select</option><option value="yes" '+(val==='yes'?'selected':'')+'>Yes</option><option value="no" '+(val==='no'?'selected':'')+'>No</option><option value="na" '+(val==='na'?'selected':'')+'>N/A</option></select>';
  }
  function doneSelect(id,val){
    val=String(val||'');
    return '<select id="'+esc(id)+'" style="min-width:94px;"><option value="">Select</option><option value="done" '+(val==='done'?'selected':'')+'>Done</option><option value="na" '+(val==='na'?'selected':'')+'>N/A</option></select>';
  }

  function carFormHtml(rec){
    const form=jsonObj(rec&&rec.car_cleaning_form),cars=Array.isArray(form.cars)?form.cars:[];
    const noCars=!!form.no_cars;
    function carBlock(index){
      const car=jsonObj(cars[index]),items=jsonObj(car.items);
      return '<div style="border:1px solid var(--line-soft);border-radius:10px;padding:12px;margin-top:10px;">'
        +'<div class="form-row"><div class="field"><label>Car '+(index+1)+' registration'+(index===0?' *':'')+'</label><input id="wdf-car-'+index+'-reg" value="'+esc(car.reg||'')+'" placeholder="Registration"></div></div>'
        +'<div style="overflow:auto;"><table><thead><tr><th style="text-align:left;">Section</th><th style="text-align:left;">Check</th><th>Status</th></tr></thead><tbody>'
        +CAR_ITEMS.map(function(it){return '<tr><td>'+esc(it[1])+'</td><td>'+esc(it[2])+'</td><td>'+doneSelect('wdf-car-'+index+'-'+it[0],items[it[0]])+'</td></tr>';}).join('')
        +'</tbody></table></div></div>';
    }
    return '<details open class="wdf-form" style="border:1px solid var(--line-soft);border-radius:12px;padding:12px;margin:12px 0;"><summary style="cursor:pointer;font-weight:800;font-size:16px;">Loan Car Cleaning Rota</summary>'
      +'<div style="color:var(--muted);font-size:12px;margin:7px 0 10px;">Loan cars must be cleaned weekly. Complete every item for each vehicle, or mark N/A where appropriate.</div>'
      +'<label style="display:flex;gap:8px;align-items:center;margin:8px 0 4px;"><input id="wdf-car-none" type="checkbox" '+(noCars?'checked':'')+'> No loan car on site this week</label>'
      +carBlock(0)+carBlock(1)
      +'<div class="form-row" style="margin-top:10px;"><div class="field"><label>Completed by *</label><input id="wdf-car-by" value="'+esc(form.completed_by||'')+'" placeholder="Print name"></div><div class="field"><label>Date</label><input id="wdf-car-date" type="date" value="'+esc(form.completed_date||isoLocal(new Date()))+'"></div></div>'
      +'<div class="field"><label>Notes</label><textarea id="wdf-car-notes" rows="2" placeholder="Optional">'+esc(form.notes||'')+'</textarea></div>'
      +'</details>';
  }

  function siteCleaningHtml(rec){
    const form=jsonObj(rec&&rec.site_cleaning_form),days=jsonObj(form.days);
    return '<details open class="wdf-form" style="border:1px solid var(--line-soft);border-radius:12px;padding:12px;margin:12px 0;"><summary style="cursor:pointer;font-weight:800;font-size:16px;">Daily Cleaning Rota</summary>'
      +'<div style="color:var(--muted);font-size:12px;margin:7px 0 10px;">Enter the person responsible for each area. Use N/A or Closed where a room/day does not apply. The final column records the daily sign-off name.</div>'
      +'<div style="overflow:auto;"><table><thead><tr><th>Day</th>'+CLEAN_AREAS.map(function(a){return '<th>'+esc(a[1])+'<div style="font-weight:400;font-size:9px;color:#666;">'+esc(a[2])+'</div></th>';}).join('')+'<th>Signature / sign-off</th></tr></thead><tbody>'
      +CLEAN_DAYS.map(function(day){const d=jsonObj(days[day]);return '<tr><td><b>'+esc(day)+'</b></td>'+CLEAN_AREAS.map(function(a){return '<td><input id="wdf-clean-'+day.toLowerCase()+'-'+a[0]+'" value="'+esc(d[a[0]]||'')+'" placeholder="Name / N/A" style="min-width:120px;"></td>';}).join('')+'<td><input id="wdf-clean-'+day.toLowerCase()+'-signature" value="'+esc(d.signature||'')+'" placeholder="Name" style="min-width:120px;"></td></tr>';}).join('')
      +'</tbody></table></div>'
      +'<div class="field" style="margin-top:10px;"><label>Cleaning notes</label><textarea id="wdf-clean-notes" rows="2" placeholder="Optional">'+esc(form.notes||'')+'</textarea></div>'
      +'</details>';
  }

  function oxyHtml(rec){
    const form=jsonObj(rec&&rec.oxy_acetylene_form),answers=jsonObj(form.answers);
    let last='';
    const rows=OXY_ITEMS.map(function(it){
      const section=it[1]!==last?'<tr><th colspan="3" style="text-align:left;background:var(--bg-soft);">'+esc(it[1])+'</th></tr>':'';last=it[1];
      return section+'<tr><td style="text-align:left;">'+esc(it[2])+'</td><td>'+statusSelect('wdf-oxy-'+it[0],answers[it[0]])+'</td><td style="width:36%;"><input id="wdf-oxy-note-'+it[0]+'" value="'+esc((jsonObj(form.item_notes))[it[0]]||'')+'" placeholder="Comment / action if needed" style="width:100%;"></td></tr>';
    }).join('');
    return '<details open class="wdf-form" style="border:1px solid var(--line-soft);border-radius:12px;padding:12px;margin:12px 0;"><summary style="cursor:pointer;font-weight:800;font-size:16px;">Oxy/Acetylene Checklist</summary>'
      +'<div style="margin:10px 0;padding:10px 12px;border-left:4px solid var(--red);background:rgba(215,25,32,.06);font-size:12px;line-height:1.45;"><b>Important:</b> There are strict controls on the use of acetylene on North East Auto Services property. Acetylene should not be used if it is possible to use another gas in its place.<br><br>Where the use of acetylene is necessary, only the minimum quantity will be allowed on site and the cylinders must be attended at all times (including break times). Should the fire alarm in the building sound, cylinders must be isolated and, where possible, removed from the building during the evacuation process.<br><br><b>Note:</b> This checklist must be used in conjunction with the hot work permit when Oxy/Acetylene cylinders are used on site.</div>'
      +'<div style="overflow:auto;"><table><thead><tr><th style="text-align:left;">Check</th><th>Yes / No / N/A</th><th style="text-align:left;">Comment / action</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<div class="form-row" style="margin-top:10px;"><div class="field"><label>Print name *</label><input id="wdf-oxy-by" value="'+esc(form.completed_by||'')+'" placeholder="Print name"></div><div class="field"><label>Date</label><input id="wdf-oxy-date" type="date" value="'+esc(form.completed_date||isoLocal(new Date()))+'"></div></div>'
      +'<div class="field"><label>Overall notes / actions</label><textarea id="wdf-oxy-notes" rows="2" placeholder="Required if any answer is No">'+esc(form.notes||'')+'</textarea></div>'
      +'</details>';
  }

  function archiveHtml(siteId){
    const rows=historyCache.get(String(siteId))||[];
    if(!rows.length)return '<div class="card" data-wdf-archive style="margin-top:14px;"><h3>Weekly Forms Archive</h3><div style="color:var(--muted);font-size:12px;">No saved weekly forms yet.</div></div>';
    return '<div class="card" data-wdf-archive style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;"><div><h3 style="font-size:18px;">Weekly Forms Archive</h3><div style="color:var(--muted);font-size:12px;margin-top:3px;">Select a week to print or download the completed forms for Gemma.</div></div><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;"><div class="field" style="margin:0;min-width:190px;"><label>Week commencing</label><select data-wdf-history-week>'+rows.map(function(r){return '<option value="'+esc(r.week_start)+'">'+esc(fmtDate(r.week_start))+'</option>';}).join('')+'</select></div><button type="button" class="btn-sm" data-wdf-print>🖶 Print / Save PDF</button><button type="button" class="btn-sm" data-wdf-download>⬇ Download forms</button></div></div></div>';
  }

  function digitalBlock(rec){
    return '<div data-wdf-digital style="margin-top:14px;">'
      +'<div style="padding:12px;border-radius:10px;background:rgba(25,118,210,.06);border-left:4px solid #1976d2;margin-bottom:12px;"><b>Digital weekly forms</b><div style="font-size:12px;color:var(--muted);margin-top:4px;">Complete these forms online. Photos are no longer required for car cleaning, site cleaning or Oxy/Acetylene. The stock take attachment remains required.</div></div>'
      +carFormHtml(rec)+siteCleaningHtml(rec)+oxyHtml(rec)
      +'</div>';
  }

  function patchWeeklyHtml(html){
    if(!state.admin)return html;
    const wrap=document.createElement('div');wrap.innerHTML=html;
    const main=wrap.querySelector('.admin-main');if(!main)return html;

    if(state.admin.role==='site'&&!isWorkshop(siteFor(state.admin.scopeSite))){
      const reminder=main.querySelector('[data-weekly-open]');if(reminder){const box=reminder.closest('div[style*="border-left:5px"]');if(box)box.remove();}
      if(state.admin.tab===TAB_KEY){const top=main.querySelector('.admin-topbar');main.innerHTML=(top?top.outerHTML:'')+'<h2>Weekly Checks</h2><div class="card">Weekly Checks are only required for workshop sites.</div>';}
      return wrap.innerHTML;
    }
    if(state.admin.tab!==TAB_KEY)return wrap.innerHTML;

    const ws=workshopSites(),ids=new Set(ws.map(function(s){return String(s.id);}));
    const select=main.querySelector('#weekly-site-select');
    if(select){
      Array.from(select.options).forEach(function(o){if(!ids.has(String(o.value)))o.remove();});
      if(!ids.has(String(state.admin.weeklySite||''))&&select.options.length){state.admin.weeklySite=select.options[0].value;select.value=state.admin.weeklySite;}
    }
    Array.from(main.querySelectorAll('[data-weekly-site]')).forEach(function(btn){if(!ids.has(String(btn.getAttribute('data-weekly-site')||''))){const tr=btn.closest('tr');if(tr)tr.remove();}});
    Array.from(main.querySelectorAll('h3')).forEach(function(h){if(h.textContent.trim()==='All-sites weekly status')h.textContent='Workshop weekly status';});
    const sub=main.querySelector('h2 + .head-sub');if(sub)sub.textContent='Workshop managers complete the weekly checks online. Car cleaning, site cleaning and Oxy/Acetylene are digital forms; only the stock take still needs an attachment.';

    const sid=currentSiteId();
    if(sid&&isWorkshop(siteFor(sid))){
      scheduleLoads(sid);
      const rec=currentCache.get(String(sid))||null;
      const form=main.querySelector('#weekly-check-form');
      if(form){
        ['wc-car','wc-site','wc-oxy'].forEach(function(id){const el=form.querySelector('#'+id);if(el){const label=el.closest('label');if(label)label.style.display='none';}});
        const timeEl=form.querySelector('#wc-timesheet');const timeLabel=timeEl?timeEl.closest('label'):null;
        if(timeLabel&&!form.querySelector('[data-wdf-digital]'))timeLabel.insertAdjacentHTML('afterend',digitalBlock(rec));
        const btn=form.querySelector('[data-weekly-submit]');if(btn)btn.textContent=(rec&&rec.id)?'Update weekly checks & digital forms':'Submit weekly checks & digital forms';
      }
      if(!main.querySelector('[data-wdf-archive]'))main.insertAdjacentHTML('beforeend',archiveHtml(sid));
    }
    return wrap.innerHTML;
  }

  function input(id){const el=document.getElementById(id);return el?String(el.value||'').trim():'';}
  function collectCar(){
    const noCars=!!(document.getElementById('wdf-car-none')||{}).checked;
    const cars=[0,1].map(function(i){const items={};CAR_ITEMS.forEach(function(it){items[it[0]]=input('wdf-car-'+i+'-'+it[0]);});return {reg:input('wdf-car-'+i+'-reg').toUpperCase(),items:items};});
    return {version:1,no_cars:noCars,cars:cars,completed_by:input('wdf-car-by'),completed_date:input('wdf-car-date'),notes:input('wdf-car-notes')};
  }
  function collectCleaning(){
    const days={};
    CLEAN_DAYS.forEach(function(day){const k=day.toLowerCase(),d={};CLEAN_AREAS.forEach(function(a){d[a[0]]=input('wdf-clean-'+k+'-'+a[0]);});d.signature=input('wdf-clean-'+k+'-signature');days[day]=d;});
    return {version:1,days:days,notes:input('wdf-clean-notes')};
  }
  function collectOxy(){
    const answers={},itemNotes={};OXY_ITEMS.forEach(function(it){answers[it[0]]=input('wdf-oxy-'+it[0]);itemNotes[it[0]]=input('wdf-oxy-note-'+it[0]);});
    return {version:1,answers:answers,item_notes:itemNotes,completed_by:input('wdf-oxy-by'),completed_date:input('wdf-oxy-date'),notes:input('wdf-oxy-notes')};
  }

  function validateCar(f){
    if(!f.completed_by)return 'Enter the name of the person completing the Loan Car Cleaning Rota.';
    if(f.no_cars)return '';
    if(!f.cars[0].reg)return 'Enter Car 1 registration, or tick “No loan car on site this week”.';
    for(let i=0;i<f.cars.length;i++){
      const c=f.cars[i];if(!c.reg)continue;
      const missing=CAR_ITEMS.filter(function(it){return !c.items[it[0]];});
      if(missing.length)return 'Complete every cleaning item for Car '+(i+1)+' ('+c.reg+').';
    }
    return '';
  }
  function validateCleaning(f){
    for(const day of CLEAN_DAYS){
      const d=f.days[day];
      for(const a of CLEAN_AREAS){if(!d[a[0]])return 'Complete the '+day+' cleaning rota. Use N/A or Closed where an area does not apply.';}
      if(!d.signature)return 'Enter the '+day+' cleaning rota sign-off name.';
    }
    return '';
  }
  function validateOxy(f){
    if(!f.completed_by)return 'Enter the print name on the Oxy/Acetylene checklist.';
    const missing=OXY_ITEMS.filter(function(it){return !f.answers[it[0]];});
    if(missing.length)return 'Answer every Oxy/Acetylene checklist item.';
    const noItems=OXY_ITEMS.filter(function(it){return f.answers[it[0]]==='no';});
    if(noItems.length&&!f.notes&&!noItems.some(function(it){return f.item_notes[it[0]];}))return 'Add the action taken for any Oxy/Acetylene answer marked No.';
    return '';
  }

  async function uploadStock(siteId,file){
    const ext=fileExt(file.name);if(!ALLOWED_EXT.has(ext))throw new Error('Stock attachment must be PDF, image, CSV or Excel.');if(file.size>MAX_FILE_BYTES)throw new Error('Each stock attachment must be 20 MB or smaller.');
    const path=siteId+'/'+mondayIso()+'/stocktake/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders();headers['Content-Type']=mimeFor(file);headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers,body:file});
    if(!res.ok)throw new Error('Stock attachment upload failed ('+res.status+').');
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,category:'stocktake',uploadedAt:new Date().toISOString()};
  }

  async function submitDigital(){
    if(saving)return;
    const form=document.getElementById('weekly-check-form');if(!form)return;
    const siteId=String(form.dataset.siteId||'');if(!isWorkshop(siteFor(siteId))){showToast('Weekly checks are only for workshop sites.',true);return;}
    const time=document.getElementById('wc-timesheet');if(!time||!time.checked){showToast('Complete the weekly time sheet check first.',true);return;}
    const car=collectCar(),clean=collectCleaning(),oxy=collectOxy();
    const err=validateCar(car)||validateCleaning(clean)||validateOxy(oxy);if(err){showToast(err,true);return;}
    saving=true;const btn=document.querySelector('[data-weekly-submit]');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{
      const existing=await fetchCurrent(siteId)||{};
      let stockFiles=Array.isArray(existing.stock_files)?existing.stock_files.slice():[];
      const stockInput=document.getElementById('wc-stock-files'),chosen=stockInput&&stockInput.files?Array.from(stockInput.files):[];
      if(!stockFiles.length&&!chosen.length)throw new Error('Upload the completed stock take sheet before submitting.');
      for(const file of chosen)stockFiles.push(await uploadStock(siteId,file));
      const payload={
        site_id:siteId,week_start:mondayIso(),weekly_timesheet_done:true,car_cleaning_done:true,site_cleaning_done:true,stock_take_done:true,oxy_acetylene_done:true,
        flag_status:(document.getElementById('wc-flag')||{}).value||'ok',mot_log_status:(document.getElementById('wc-mot')||{}).value||'up_to_date',
        maintenance_status:input('wc-maint')||'OK',vehicles_left_status:input('wc-vehicles')||'No vehicles left on site',alarm_callout_status:input('wc-alarm')||'Not required',notes:input('wc-notes'),
        stock_files:stockFiles,car_cleaning_form:car,site_cleaning_form:clean,oxy_acetylene_form:oxy
      };
      const headers=await authHeaders();headers['Content-Type']='application/json';headers['Prefer']='resolution=merge-duplicates,return=representation';
      const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?on_conflict=site_id,week_start',{method:'POST',headers,body:JSON.stringify(payload)});
      if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('Save failed ('+res.status+')'));}
      currentCache.delete(siteId);historyCache.delete(siteId);showToast('Weekly checks and digital forms submitted.');
      await fetchCurrent(siteId).catch(function(){});await fetchHistory(siteId).catch(function(){});if(typeof render==='function')render();
    }catch(e){showToast('Could not save weekly checks — '+(e&&e.message?e.message:'unknown error'),true);}
    finally{saving=false;if(btn){btn.disabled=false;btn.textContent='Submit weekly checks & digital forms';}}
  }

  function selectedArchiveRow(){
    const sid=currentSiteId(),rows=historyCache.get(String(sid))||[];const sel=document.querySelector('[data-wdf-history-week]');const wk=sel?sel.value:mondayIso();return rows.find(function(r){return String(r.week_start)===String(wk);})||currentCache.get(String(sid))||null;
  }

  function printableHtml(row,siteName){
    const car=jsonObj(row&&row.car_cleaning_form),clean=jsonObj(row&&row.site_cleaning_form),oxy=jsonObj(row&&row.oxy_acetylene_form);
    const cars=Array.isArray(car.cars)?car.cars:[],days=jsonObj(clean.days),ans=jsonObj(oxy.answers),notes=jsonObj(oxy.item_notes);
    function mark(v){return v==='yes'||v==='done'?'✓':v==='no'?'NO':v==='na'?'N/A':'—';}
    const carTables=car.no_cars?'<p><b>No loan car on site this week.</b></p>':cars.filter(function(c){return c&&c.reg;}).map(function(c,i){return '<h3>Car '+(i+1)+' · '+esc(c.reg)+'</h3><table><thead><tr><th>Section</th><th>Check</th><th>Status</th></tr></thead><tbody>'+CAR_ITEMS.map(function(it){return '<tr><td>'+esc(it[1])+'</td><td>'+esc(it[2])+'</td><td>'+mark(jsonObj(c.items)[it[0]])+'</td></tr>';}).join('')+'</tbody></table>';}).join('');
    const cleaning='<table><thead><tr><th>Day</th>'+CLEAN_AREAS.map(function(a){return '<th>'+esc(a[1])+'</th>';}).join('')+'<th>Signature / sign-off</th></tr></thead><tbody>'+CLEAN_DAYS.map(function(day){const d=jsonObj(days[day]);return '<tr><td><b>'+day+'</b></td>'+CLEAN_AREAS.map(function(a){return '<td>'+esc(d[a[0]]||'—')+'</td>';}).join('')+'<td>'+esc(d.signature||'—')+'</td></tr>';}).join('')+'</tbody></table>';
    const oxyRows=OXY_ITEMS.map(function(it){return '<tr><td>'+esc(it[1])+'</td><td>'+esc(it[2])+'</td><td>'+mark(ans[it[0]])+'</td><td>'+esc(notes[it[0]]||'')+'</td></tr>';}).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>Weekly Forms - '+esc(siteName)+' - '+esc(row&&row.week_start||'')+'</title><style>@page{size:A4 portrait;margin:11mm;}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}header{border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:12px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:16px 0 7px;border-bottom:1px solid #999;padding-bottom:4px}h3{font-size:13px;margin:10px 0 5px}p{line-height:1.45}.warning{border-left:4px solid #d71920;background:#fff5f5;padding:8px 10px}table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{border:1px solid #888;padding:5px;vertical-align:top}th{background:#eee;text-align:left}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 12px}.meta div{border:1px solid #bbb;padding:6px}.pagebreak{page-break-before:always}.no-print{margin-top:14px}.no-print button{font-size:13px;padding:8px 12px}@media print{.no-print{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
      +'<header><h1>North East Auto Services · Weekly Forms</h1><div><b>'+esc(siteName)+'</b> · Week commencing '+esc(fmtDate(row&&row.week_start))+'</div></header>'
      +'<div class="meta"><div><b>Submitted</b><br>'+esc(fmtDateTime(row&&row.submitted_at))+'</div><div><b>Manager</b><br>'+esc(row&&row.submitted_by_email||'—')+'</div></div>'
      +'<h2>Loan Car Cleaning Rota</h2><p>Please ensure loan cars are cleaned weekly.</p>'+carTables+'<p><b>Completed by:</b> '+esc(car.completed_by||'—')+' &nbsp; <b>Date:</b> '+esc(car.completed_date||'—')+'</p>'+(car.notes?'<p><b>Notes:</b> '+esc(car.notes)+'</p>':'')
      +'<div class="pagebreak"></div><h2>Daily Cleaning Rota</h2>'+cleaning+(clean.notes?'<p><b>Notes:</b> '+esc(clean.notes)+'</p>':'')
      +'<div class="pagebreak"></div><h2>Oxy/Acetylene Checklist</h2><div class="warning"><b>Important:</b> There are strict controls on the use of acetylene on North East Auto Services property. Acetylene should not be used if it is possible to use another gas in its place. Where acetylene is necessary, use only the minimum quantity, attend cylinders at all times, isolate them if the fire alarm sounds and, where possible, remove them during evacuation.<br><br><b>Note:</b> Use this checklist with the hot work permit when Oxy/Acetylene cylinders are used on site.</div><table><thead><tr><th>Section</th><th>Check</th><th>Result</th><th>Comment / action</th></tr></thead><tbody>'+oxyRows+'</tbody></table><p><b>Print name:</b> '+esc(oxy.completed_by||'—')+' &nbsp; <b>Date:</b> '+esc(oxy.completed_date||'—')+'</p>'+(oxy.notes?'<p><b>Overall notes / actions:</b> '+esc(oxy.notes)+'</p>':'')
      +'<h2>Weekly Manager Checks</h2><table><tbody><tr><th>Weekly timesheet</th><td>'+(row&&row.weekly_timesheet_done?'Complete':'Outstanding')+'</td><th>Stock take</th><td>'+(row&&row.stock_take_done?'Complete':'Outstanding')+'</td></tr><tr><th>Flag condition</th><td>'+esc(row&&row.flag_status||'—')+'</td><th>MOT test log</th><td>'+esc(row&&row.mot_log_status||'—')+'</td></tr><tr><th>Maintenance</th><td>'+esc(row&&row.maintenance_status||'—')+'</td><th>Vehicles left</th><td>'+esc(row&&row.vehicles_left_status||'—')+'</td></tr><tr><th>Alarm call-out</th><td>'+esc(row&&row.alarm_callout_status||'—')+'</td><th>Notes</th><td>'+esc(row&&row.notes||'—')+'</td></tr></tbody></table>'
      +'<div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div></body></html>';
  }

  function printSelected(){
    const row=selectedArchiveRow(),sid=currentSiteId(),site=siteFor(sid);if(!row||!site){showToast('No saved weekly forms for that week.',true);return;}
    const w=window.open('about:blank','_blank','width=1000,height=850');if(!w){showToast('Allow pop-ups to print the weekly forms.',true);return;}
    w.document.open();w.document.write(printableHtml(row,site.name));w.document.close();setTimeout(function(){try{w.focus();w.print();}catch(_e){}},350);
  }

  function downloadSelected(){
    const row=selectedArchiveRow(),sid=currentSiteId(),site=siteFor(sid);if(!row||!site){showToast('No saved weekly forms for that week.',true);return;}
    const html=printableHtml(row,site.name),blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='Weekly-Forms-'+String(site.name||'Site').replace(/[^a-z0-9]+/gi,'-')+'-'+row.week_start+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);
  }

  async function printWorkshopSummary(){
    if(!state.admin||state.admin.role!=='super'){showToast('Upper Management access required.',true);return;}
    try{
      const headers=await authHeaders(),wk=mondayIso();const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(wk),{headers,cache:'no-store'});if(!res.ok)throw new Error('Weekly checks '+res.status);const rows=await res.json(),by=new Map(rows.map(function(r){return [String(r.site_id),r];})),ws=workshopSites();
      const trs=ws.map(function(s){const r=by.get(String(s.id));return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+(r?'DONE':'OUTSTANDING')+'</td><td>'+(r&&r.car_cleaning_done?'✓':'—')+'</td><td>'+(r&&r.site_cleaning_done?'✓':'—')+'</td><td>'+(r&&r.stock_take_done?'✓':'—')+'</td><td>'+(r&&r.oxy_acetylene_done?'✓':'—')+'</td><td>'+esc(r?fmtDateTime(r.submitted_at):'—')+'</td></tr>';}).join('');
      const html='<!doctype html><html><head><meta charset="utf-8"><title>Workshop Weekly Status</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px}h1{margin:0 0 5px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px}th{background:#eee;text-align:left}</style></head><body><h1>Workshop Weekly Status</h1><p>Week commencing '+esc(fmtDate(wk))+'</p><table><thead><tr><th>Site</th><th>Status</th><th>Car form</th><th>Cleaning rota</th><th>Stock</th><th>Oxy form</th><th>Submitted</th></tr></thead><tbody>'+trs+'</tbody></table><script>setTimeout(function(){window.print()},250)<\/script></body></html>';
      const w=window.open('about:blank','_blank','width=1200,height=850');if(!w){showToast('Allow pop-ups to print the report.',true);return;}w.document.open();w.document.write(html);w.document.close();
    }catch(e){showToast('Could not load weekly report — '+(e&&e.message?e.message:'connection problem'),true);}
  }

  try{
    if(typeof renderAdmin==='function'){
      const oldRender=renderAdmin;
      renderAdmin=function(){return patchWeeklyHtml(oldRender());};
    }
  }catch(e){console.error('Digital weekly forms setup failed:',e);}

  window.addEventListener('click',function(e){
    const submit=e.target&&e.target.closest?e.target.closest('[data-weekly-submit]'):null;
    if(submit){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();submitDigital();return;}
    const print=e.target&&e.target.closest?e.target.closest('[data-wdf-print]'):null;
    if(print){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();printSelected();return;}
    const download=e.target&&e.target.closest?e.target.closest('[data-wdf-download]'):null;
    if(download){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();downloadSelected();return;}
    const summary=e.target&&e.target.closest?e.target.closest('[data-weekly-print-report]'):null;
    if(summary){e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();printWorkshopSummary();return;}
  },true);
})();
