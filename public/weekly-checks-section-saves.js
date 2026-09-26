(function(){
  'use strict';

  const TAB_KEY='weeklychecks';
  const BUCKET='weekly-checks';
  const MAX_FILE_BYTES=20*1024*1024;
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp','csv','xls','xlsx']);
  const NON_WORKSHOP_IDS=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']);
  const currentCache=new Map();
  const loadingCurrent=new Set();
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
    ['cylinders_upright','Gas Cylinders'],['cylinder_key','Gas Cylinders'],['fire_gloves','PPE'],['ppe_suitable','PPE'],
    ['regulators_type_date','Regulators'],['connection_nuts','Regulators'],['oxygen_regulator_clean','Regulators'],['flashback_arrestors','Regulators'],
    ['hoses_good','Hoses'],['clips_factory','Hoses'],['spliced_hoses_checked','Hoses'],['torch_condition','Cutting torch / welding torch'],['nozzle_seated','Cutting torch / welding torch']
  ];
  const CLEAN_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const CLEAN_AREAS=[['reception','Reception Area'],['office','Office'],['toilets','Toilets'],['mess','Mess Room']];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function jsonObj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
  function sites(){return ((state.config&&state.config.sites)||[]).slice();}
  function siteFor(id){return sites().find(function(s){return String(s.id)===String(id);});}
  function isWorkshop(site){
    if(!site)return false;
    const id=String(site.id||''),name=String(site.name||'').toLowerCase();
    return !NON_WORKSHOP_IDS.has(id)&&!/petrol|filling station|floaters|upper management/.test(name)&&name!=='great ayton';
  }
  function workshopSites(){return sites().filter(isWorkshop).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});}
  function loanCarsApply(site){
    const n=String(site&&site.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    return n.indexOf('gateshead')>=0||n.indexOf('chester le street')>=0;
  }
  function currentSiteId(){
    if(!state.admin)return '';
    return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
  }
  function isoLocal(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
  function mondayIso(){const d=new Date(),diff=(d.getDay()+6)%7;d.setHours(12,0,0,0);d.setDate(d.getDate()-diff);return isoLocal(d);}
  function fmtDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  function fileExt(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
  function cleanName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
  function storagePath(path){return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');}
  function mimeFor(file){
    if(file.type)return file.type;
    const e=fileExt(file.name);
    if(e==='pdf')return 'application/pdf';if(e==='jpg'||e==='jpeg')return 'image/jpeg';if(e==='png')return 'image/png';if(e==='webp')return 'image/webp';if(e==='csv')return 'text/csv';if(e==='xls')return 'application/vnd.ms-excel';if(e==='xlsx')return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';return 'application/octet-stream';
  }
  function value(id){const el=document.getElementById(id);return el?String(el.value||'').trim():'';}
  function checked(id){const el=document.getElementById(id);return !!(el&&el.checked);}
  function setValue(root,id,val){const el=root.querySelector('#'+id);if(el)el.value=val==null?'':String(val);}
  function setChecked(root,id,val){const el=root.querySelector('#'+id);if(el)el.checked=!!val;}

  function isComplete(rec,site){
    if(!rec)return false;
    return !!(rec.weekly_timesheet_done&&rec.site_cleaning_done&&rec.stock_take_done&&rec.oxy_acetylene_done&&(!loanCarsApply(site)||rec.car_cleaning_done));
  }

  async function fetchCurrent(siteId){
    if(!siteId)return null;
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
    const res=await fetch(url,{headers,cache:'no-store'});
    if(!res.ok)throw new Error('Weekly checks '+res.status);
    const rows=await res.json(),rec=rows[0]||null;
    currentCache.set(String(siteId),rec);
    return rec;
  }
  function scheduleCurrent(siteId){
    siteId=String(siteId||'');
    if(!siteId||currentCache.has(siteId)||loadingCurrent.has(siteId))return;
    loadingCurrent.add(siteId);
    setTimeout(function(){
      fetchCurrent(siteId).catch(function(){}).finally(function(){loadingCurrent.delete(siteId);try{if(typeof render==='function')render();}catch(_e){}});
    },0);
  }

  async function writePatch(siteId,patch){
    const existing=await fetchCurrent(siteId);
    const headers=await authHeaders();headers['Content-Type']='application/json';headers['Prefer']='return=representation';
    let res;
    if(existing&&existing.id){
      res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?id=eq.'+encodeURIComponent(existing.id),{method:'PATCH',headers,body:JSON.stringify(patch)});
    }else{
      const payload=Object.assign({site_id:siteId,week_start:mondayIso()},patch);
      res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks',{method:'POST',headers,body:JSON.stringify(payload)});
      if(res.status===409){
        const again=await fetchCurrent(siteId);
        if(again&&again.id)res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?id=eq.'+encodeURIComponent(again.id),{method:'PATCH',headers,body:JSON.stringify(patch)});
      }
    }
    if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('Save failed ('+res.status+')'));}
    await fetchCurrent(siteId);
    return currentCache.get(String(siteId))||null;
  }

  async function uploadStock(siteId,file){
    const ext=fileExt(file.name);
    if(!ALLOWED_EXT.has(ext))throw new Error('Stock attachment must be PDF, image, CSV or Excel.');
    if(file.size>MAX_FILE_BYTES)throw new Error('Each stock attachment must be 20 MB or smaller.');
    const path=siteId+'/'+mondayIso()+'/stocktake/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders();headers['Content-Type']=mimeFor(file);headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers,body:file});
    if(!res.ok)throw new Error('Stock attachment upload failed ('+res.status+').');
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,category:'stocktake',uploadedAt:new Date().toISOString()};
  }

  function carEnabledFromRecord(rec){
    const f=jsonObj(rec&&rec.car_cleaning_form);
    if(typeof f.enabled==='boolean')return f.enabled;
    if(f.no_cars===true)return false;
    const cars=Array.isArray(f.cars)?f.cars:[];
    return !!(f.completed_by||cars.some(function(c){return c&&c.reg;}));
  }
  function collectCar(){
    const enabled=checked('wdf-loan-enabled');
    if(!enabled)return {version:2,enabled:false,no_cars:true,cars:[],completed_by:'',completed_date:'',notes:''};
    const cars=[0,1].map(function(i){const items={};CAR_ITEMS.forEach(function(it){items[it[0]]=value('wdf-car-'+i+'-'+it[0]);});return {reg:value('wdf-car-'+i+'-reg').toUpperCase(),items:items};});
    return {version:2,enabled:true,no_cars:false,cars:cars,completed_by:value('wdf-car-by'),completed_date:value('wdf-car-date'),notes:value('wdf-car-notes')};
  }
  function validateCar(f){
    if(!f.enabled)return '';
    if(!f.completed_by)return 'Enter the name of the person completing the Loan Car Cleaning Rota.';
    if(!f.cars[0]||!f.cars[0].reg)return 'Enter Car 1 registration.';
    for(let i=0;i<f.cars.length;i++){
      const c=f.cars[i];if(!c||!c.reg)continue;
      if(CAR_ITEMS.some(function(it){return !c.items[it[0]];}))return 'Complete every cleaning item for Car '+(i+1)+' ('+c.reg+').';
    }
    return '';
  }
  function collectCleaningDay(day){
    const k=String(day).toLowerCase(),d={};
    CLEAN_AREAS.forEach(function(a){d[a[0]]=value('wdf-clean-'+k+'-'+a[0]);});
    d.signature=value('wdf-clean-'+k+'-signature');return d;
  }
  function validateCleaningDay(day,d){
    for(const a of CLEAN_AREAS){if(!d[a[0]])return 'Complete '+day+' '+a[1]+' before saving the day.';}
    if(!d.signature)return 'Enter the '+day+' sign-off name before saving the day.';
    return '';
  }
  function collectCleaning(){const days={};CLEAN_DAYS.forEach(function(day){days[day]=collectCleaningDay(day);});return {version:2,days:days,notes:value('wdf-clean-notes')};}
  function validateCleaning(f){
    const days=jsonObj(f.days);
    for(const day of CLEAN_DAYS){const d=jsonObj(days[day]);for(const a of CLEAN_AREAS){if(!d[a[0]])return 'Complete the '+day+' cleaning rota.';}if(!d.signature)return 'Enter the '+day+' cleaning rota sign-off name.';}
    return '';
  }
  function collectOxy(){
    const answers={},notes={};OXY_ITEMS.forEach(function(it){answers[it[0]]=value('wdf-oxy-'+it[0]);notes[it[0]]=value('wdf-oxy-note-'+it[0]);});
    return {version:2,answers:answers,item_notes:notes,completed_by:value('wdf-oxy-by'),completed_date:value('wdf-oxy-date'),notes:value('wdf-oxy-notes')};
  }
  function validateOxy(f){
    if(!f.completed_by)return 'Enter the print name on the Oxy/Acetylene checklist.';
    if(OXY_ITEMS.some(function(it){return !f.answers[it[0]];}))return 'Answer every Oxy/Acetylene checklist item.';
    const noItems=OXY_ITEMS.filter(function(it){return f.answers[it[0]]==='no';});
    if(noItems.length&&!f.notes&&!noItems.some(function(it){return f.item_notes[it[0]];}))return 'Add the action taken for any Oxy/Acetylene answer marked No.';
    return '';
  }

  async function saveDay(day,button){
    if(saving)return;
    const sid=currentSiteId(),site=siteFor(sid);if(!sid||!isWorkshop(site))return;
    const d=collectCleaningDay(day),err=validateCleaningDay(day,d);if(err){showToast(err,true);return;}
    saving=true;const old=button.textContent;button.disabled=true;button.textContent='Saving…';
    try{
      const rec=await fetchCurrent(sid)||{},oldForm=jsonObj(rec.site_cleaning_form),days=Object.assign({},jsonObj(oldForm.days));days[day]=d;
      const merged={version:2,days:days,notes:oldForm.notes||''};
      await writePatch(sid,{site_cleaning_form:merged,site_cleaning_done:!validateCleaning(merged)});
      showToast(day+' cleaning saved.');
      if(typeof render==='function')render();
    }catch(e){showToast('Could not save '+day+' — '+(e&&e.message?e.message:'connection problem'),true);}
    finally{saving=false;button.disabled=false;button.textContent=old;}
  }

  async function saveSection(kind,button){
    if(saving)return;
    const sid=currentSiteId(),site=siteFor(sid);if(!sid||!isWorkshop(site))return;
    saving=true;const old=button.textContent;button.disabled=true;button.textContent='Saving…';
    try{
      let patch={},message='Section saved.';
      if(kind==='car'){
        const f=collectCar(),err=validateCar(f);patch={car_cleaning_form:f,car_cleaning_done:!err};message=err?'Loan car section saved as a draft.':'Loan car section saved.';
      }else if(kind==='cleaning'){
        const f=collectCleaning(),err=validateCleaning(f);patch={site_cleaning_form:f,site_cleaning_done:!err};message=err?'Cleaning section saved as a draft.':'Cleaning section saved.';
      }else if(kind==='oxy'){
        const f=collectOxy(),err=validateOxy(f);patch={oxy_acetylene_form:f,oxy_acetylene_done:!err};message=err?'Oxy/Acetylene section saved as a draft.':'Oxy/Acetylene section saved.';
      }else if(kind==='manager'){
        const rec=await fetchCurrent(sid)||{};let files=Array.isArray(rec.stock_files)?rec.stock_files.slice():[];
        const input=document.getElementById('wc-stock-files'),chosen=input&&input.files?Array.from(input.files):[];
        for(const file of chosen)files.push(await uploadStock(sid,file));
        patch={
          weekly_timesheet_done:checked('wc-timesheet'),stock_take_done:files.length>0,
          flag_status:value('wc-flag')||'ok',mot_log_status:value('wc-mot')||'up_to_date',maintenance_status:value('wc-maint')||'OK',
          vehicles_left_status:value('wc-vehicles')||'No vehicles left on site',alarm_callout_status:value('wc-alarm')||'Not required',notes:value('wc-notes'),stock_files:files
        };
        message=files.length?'Manager / stock section saved.':'Manager section saved as a draft — stock sheet still required.';
      }else return;
      await writePatch(sid,patch);showToast(message);if(typeof render==='function')render();
    }catch(e){showToast('Could not save section — '+(e&&e.message?e.message:'connection problem'),true);}
    finally{saving=false;button.disabled=false;button.textContent=old;}
  }

  async function finalSubmit(button){
    if(saving)return;
    const sid=currentSiteId(),site=siteFor(sid);if(!sid||!isWorkshop(site)){showToast('Weekly checks are only for workshop sites.',true);return;}
    if(!checked('wc-timesheet')){showToast('Complete the weekly time sheet check first.',true);return;}
    const car=loanCarsApply(site)?collectCar():{version:2,enabled:false,no_cars:true,cars:[],completed_by:'',completed_date:'',notes:''};
    const clean=collectCleaning(),oxy=collectOxy();
    const err=(loanCarsApply(site)?validateCar(car):'')||validateCleaning(clean)||validateOxy(oxy);if(err){showToast(err,true);return;}
    saving=true;const old=button.textContent;button.disabled=true;button.textContent='Submitting…';
    try{
      const rec=await fetchCurrent(sid)||{};let files=Array.isArray(rec.stock_files)?rec.stock_files.slice():[];
      const input=document.getElementById('wc-stock-files'),chosen=input&&input.files?Array.from(input.files):[];
      for(const file of chosen)files.push(await uploadStock(sid,file));
      if(!files.length)throw new Error('Upload the completed stock take sheet before submitting.');
      await writePatch(sid,{
        weekly_timesheet_done:true,car_cleaning_done:true,site_cleaning_done:true,stock_take_done:true,oxy_acetylene_done:true,
        flag_status:value('wc-flag')||'ok',mot_log_status:value('wc-mot')||'up_to_date',maintenance_status:value('wc-maint')||'OK',
        vehicles_left_status:value('wc-vehicles')||'No vehicles left on site',alarm_callout_status:value('wc-alarm')||'Not required',notes:value('wc-notes'),stock_files:files,
        car_cleaning_form:car,site_cleaning_form:clean,oxy_acetylene_form:oxy
      });
      showToast('Weekly checks submitted.');if(typeof render==='function')render();
    }catch(e){showToast('Could not submit weekly checks — '+(e&&e.message?e.message:'connection problem'),true);}
    finally{saving=false;button.disabled=false;button.textContent=old;}
  }

  function findDetails(main,title){return Array.from(main.querySelectorAll('details.wdf-form')).find(function(d){const s=d.querySelector('summary');return s&&s.textContent.trim()===title;})||null;}
  function buttonHtml(attr,label){return '<button type="button" class="btn-sm" '+attr+' style="margin-top:10px;">'+esc(label)+'</button>';}

  function patchLoanCars(main,rec,site){
    const details=findDetails(main,'Loan Car Cleaning Rota');if(!details)return;
    if(!loanCarsApply(site)){details.remove();return;}
    const summary=details.querySelector('summary');
    const enabled=carEnabledFromRecord(rec);
    const body=document.createElement('div');body.setAttribute('data-wdf-loan-body','1');body.style.display=enabled?'block':'none';
    Array.from(details.children).forEach(function(ch){if(ch!==summary)body.appendChild(ch);});
    const oldNone=body.querySelector('#wdf-car-none');if(oldNone){const l=oldNone.closest('label');if(l)l.remove();else oldNone.remove();}
    const toggle=document.createElement('label');toggle.style.cssText='display:flex;gap:9px;align-items:center;margin:10px 0 4px;font-weight:700;cursor:pointer;';
    toggle.innerHTML='<input id="wdf-loan-enabled" type="checkbox" '+(enabled?'checked':'')+' style="width:18px;height:18px;"> Loan cars on site this week — show cleaning rota';
    const hint=document.createElement('div');hint.style.cssText='color:var(--muted);font-size:12px;margin-bottom:7px;';hint.textContent='Loan car checks only apply at Gateshead and Chester-le-Street. Leave unticked when there are no loan cars to complete.';
    const save=document.createElement('div');save.innerHTML=buttonHtml('data-wdf-save-section="car"','Save loan car section');
    details.appendChild(toggle);details.appendChild(hint);details.appendChild(body);details.appendChild(save.firstChild);
  }

  function patchCleaning(main){
    const details=findDetails(main,'Daily Cleaning Rota');if(!details)return;
    const table=details.querySelector('table');if(table){
      const hr=table.querySelector('thead tr');if(hr&&!hr.querySelector('[data-wdf-save-head]')){const th=document.createElement('th');th.setAttribute('data-wdf-save-head','1');th.textContent='Save';hr.appendChild(th);}
      Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
        const day=String((tr.cells[0]&&tr.cells[0].textContent)||'').trim();if(CLEAN_DAYS.indexOf(day)<0||tr.querySelector('[data-wdf-save-day]'))return;
        const td=document.createElement('td');td.innerHTML='<button type="button" class="btn-sm" data-wdf-save-day="'+esc(day)+'">Save '+esc(day)+'</button>';tr.appendChild(td);
      });
    }
    if(!details.querySelector('[data-wdf-save-section="cleaning"]'))details.insertAdjacentHTML('beforeend',buttonHtml('data-wdf-save-section="cleaning"','Save cleaning section'));
  }
  function patchOxy(main){const d=findDetails(main,'Oxy/Acetylene Checklist');if(d&&!d.querySelector('[data-wdf-save-section="oxy"]'))d.insertAdjacentHTML('beforeend',buttonHtml('data-wdf-save-section="oxy"','Save Oxy/Acetylene section'));}

  function syncFields(main,rec,site){
    if(!rec)return;
    setChecked(main,'wc-timesheet',rec.weekly_timesheet_done);setValue(main,'wc-flag',rec.flag_status||'ok');setValue(main,'wc-mot',rec.mot_log_status||'up_to_date');
    setValue(main,'wc-maint',rec.maintenance_status||'OK');setValue(main,'wc-vehicles',rec.vehicles_left_status||'No vehicles left on site');setValue(main,'wc-alarm',rec.alarm_callout_status||'Not required');setValue(main,'wc-notes',rec.notes||'');
    if(loanCarsApply(site)){
      const f=jsonObj(rec.car_cleaning_form),cars=Array.isArray(f.cars)?f.cars:[];setChecked(main,'wdf-loan-enabled',carEnabledFromRecord(rec));
      cars.slice(0,2).forEach(function(c,i){c=jsonObj(c);setValue(main,'wdf-car-'+i+'-reg',c.reg||'');const items=jsonObj(c.items);CAR_ITEMS.forEach(function(it){setValue(main,'wdf-car-'+i+'-'+it[0],items[it[0]]||'');});});
      setValue(main,'wdf-car-by',f.completed_by||'');setValue(main,'wdf-car-date',f.completed_date||'');setValue(main,'wdf-car-notes',f.notes||'');
    }
    const clean=jsonObj(rec.site_cleaning_form),days=jsonObj(clean.days);CLEAN_DAYS.forEach(function(day){const d=jsonObj(days[day]),k=day.toLowerCase();CLEAN_AREAS.forEach(function(a){setValue(main,'wdf-clean-'+k+'-'+a[0],d[a[0]]||'');});setValue(main,'wdf-clean-'+k+'-signature',d.signature||'');});setValue(main,'wdf-clean-notes',clean.notes||'');
    const oxy=jsonObj(rec.oxy_acetylene_form),answers=jsonObj(oxy.answers),notes=jsonObj(oxy.item_notes);OXY_ITEMS.forEach(function(it){setValue(main,'wdf-oxy-'+it[0],answers[it[0]]||'');setValue(main,'wdf-oxy-note-'+it[0],notes[it[0]]||'');});setValue(main,'wdf-oxy-by',oxy.completed_by||'');setValue(main,'wdf-oxy-date',oxy.completed_date||'');setValue(main,'wdf-oxy-notes',oxy.notes||'');

    const stockInput=main.querySelector('#wc-stock-files');if(stockInput){
      const parent=stockInput.parentElement;Array.from(parent.querySelectorAll('[data-weekly-file]')).forEach(function(b){if(!b.closest('[data-wdf-stock-list]'))b.style.display='none';});
      Array.from(parent.querySelectorAll('div')).forEach(function(d){if(d.textContent.trim()==='No stock sheet uploaded yet.')d.style.display='none';});
      const files=Array.isArray(rec.stock_files)?rec.stock_files:[];
      if(files.length&&!parent.querySelector('[data-wdf-stock-list]')){
        const list=document.createElement('div');list.setAttribute('data-wdf-stock-list','1');list.style.cssText='display:flex;flex-direction:column;gap:7px;margin-top:9px;';
        list.innerHTML=files.map(function(f){return '<button type="button" class="btn-sm" data-weekly-file="'+esc(f.path||'')+'" data-weekly-name="'+esc(f.name||'Stock sheet')+'" style="text-align:left;width:max-content;max-width:100%;overflow:hidden;text-overflow:ellipsis;">📎 '+esc(f.name||'Stock sheet')+'</button>';}).join('');
        stockInput.insertAdjacentElement('afterend',list);
      }
    }
  }

  function patchFormStatus(main,rec,site){
    const form=main.querySelector('#weekly-check-form');if(!form)return;
    const card=form.closest('.card'),complete=isComplete(rec,site),draft=!!rec;
    if(card){
      const pill=card.querySelector('.pill');if(pill){pill.className='pill '+(complete?'pill-approved':draft?'pill-pending':'pill-rejected');pill.textContent=complete?'SUBMITTED':draft?'DRAFT SAVED':'NOT DONE';}
      Array.from(card.children).forEach(function(ch){if(ch!==form&&ch.tagName==='DIV'&&(ch.textContent.trim().indexOf('Submitted ')===0||ch.textContent.trim()==='This week is still outstanding.'))ch.style.display='none';});
      if(!card.querySelector('[data-wdf-status-note]')){
        const note=document.createElement('div');note.setAttribute('data-wdf-status-note','1');note.style.cssText='margin-top:10px;color:var(--muted);font-size:12px;';
        note.innerHTML=complete?'Submitted '+esc(fmtDateTime(rec&&rec.submitted_at))+'.':draft?'Saved as a draft. Complete the remaining sections, then use Final submit weekly checks.':'This week is still outstanding.';
        const head=card.firstElementChild;if(head)head.insertAdjacentElement('afterend',note);
      }
    }
    const oldFinal=form.querySelector('[data-weekly-submit]');if(oldFinal){oldFinal.removeAttribute('data-weekly-submit');oldFinal.setAttribute('data-wdf-final-submit','1');oldFinal.textContent=complete?'Update & final submit weekly checks':'Final submit weekly checks';}
    if(!form.querySelector('[data-wdf-save-section="manager"]')){
      const final=form.querySelector('[data-wdf-final-submit]');if(final)final.insertAdjacentHTML('beforebegin','<button type="button" class="action-btn secondary" data-wdf-save-section="manager" style="max-width:360px;margin-right:8px;">Save manager / stock section</button>');
    }
  }

  function patchSummary(main){
    if(!state.admin||state.admin.role!=='super')return;
    const ws=workshopSites();ws.forEach(function(s){scheduleCurrent(String(s.id));});
    let known=0,done=0;
    Array.from(main.querySelectorAll('[data-weekly-site]')).forEach(function(btn){
      const sid=String(btn.getAttribute('data-weekly-site')||''),site=siteFor(sid);if(!currentCache.has(sid))return;known++;
      const rec=currentCache.get(sid),ok=isComplete(rec,site);if(ok)done++;
      const tr=btn.closest('tr');if(!tr)return;const pill=tr.querySelector('.pill');if(pill){pill.className='pill '+(ok?'pill-approved':rec?'pill-pending':'pill-rejected');pill.textContent=ok?'Done':rec?'Draft':'Not done';}
      if(tr.cells[2])tr.cells[2].textContent=ok?fmtDateTime(rec&&rec.submitted_at):(rec?'Draft · '+fmtDateTime(rec.updated_at||rec.submitted_at):'—');
    });
    if(known===ws.length){
      const h=Array.from(main.querySelectorAll('h3')).find(function(x){return x.textContent.trim()==='Workshop weekly status';});
      const card=h&&h.closest('.card');if(card){const boxes=Array.from(card.querySelectorAll('div')).filter(function(d){return /of\s+\d+\s+completed/.test(d.textContent||'');});if(boxes.length)boxes[0].innerHTML='<b>'+done+'</b> of <b>'+ws.length+'</b> completed';}
    }
  }

  function patchReminder(main,site){
    if(!state.admin||state.admin.role!=='site'||!isWorkshop(site))return;
    const sid=String(site.id||'');scheduleCurrent(sid);if(!currentCache.has(sid))return;
    const rec=currentCache.get(sid),complete=isComplete(rec,site);
    const btn=main.querySelector('[data-weekly-open]'),box=btn&&btn.closest('div[style*="border-left:5px"]');
    if(complete){if(box)box.remove();const own=main.querySelector('[data-wdf-draft-reminder]');if(own)own.remove();return;}
    if(box&&rec){const b=box.querySelector('b');if(b){b.textContent='Weekly checks saved as draft';b.style.color='var(--amber)';}const span=box.querySelector('span');if(span)span.textContent='Some sections are saved, but the weekly checks have not been finally submitted yet.';return;}
    if(!box&&!main.querySelector('[data-wdf-draft-reminder]')){
      const top=main.querySelector('.admin-topbar');if(top)top.insertAdjacentHTML('afterend','<div data-wdf-draft-reminder style="margin:0 0 16px;padding:13px 14px;border:1px solid var(--amber);border-left:5px solid var(--amber);background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><b style="display:block;color:var(--amber);">Weekly checks saved as draft</b><span style="font-size:12px;color:var(--muted);">Complete the remaining sections and final-submit the week.</span></div><button type="button" class="btn-sm" data-weekly-open>Continue</button></div>');
    }
  }

  function patchWeeklyHtml(html){
    if(typeof state==='undefined'||!state.admin)return html;
    const wrap=document.createElement('div');wrap.innerHTML=html;const main=wrap.querySelector('.admin-main');if(!main)return html;
    const site=siteFor(currentSiteId());
    if(state.admin.tab!==TAB_KEY){patchReminder(main,site);return wrap.innerHTML;}
    const sid=currentSiteId();if(sid&&isWorkshop(site))scheduleCurrent(sid);
    patchSummary(main);
    const rec=currentCache.has(String(sid))?currentCache.get(String(sid)):null;
    if(sid&&isWorkshop(site)){
      patchLoanCars(main,rec,site);patchCleaning(main);patchOxy(main);syncFields(main,rec,site);patchFormStatus(main,rec,site);
      const archive=main.querySelector('[data-wdf-archive]'),sel=archive&&archive.querySelector('[data-wdf-history-week]');if(sel&&rec&&!isComplete(rec,site)){const opt=Array.from(sel.options).find(function(o){return o.value===mondayIso();});if(opt)opt.remove();}
    }
    return wrap.innerHTML;
  }

  try{
    if(typeof renderAdmin==='function'){
      const oldRender=renderAdmin;renderAdmin=function(){return patchWeeklyHtml(oldRender());};
    }
  }catch(e){console.error('Weekly section saves setup failed:',e);}

  window.addEventListener('change',function(e){
    if(!e.target||e.target.id!=='wdf-loan-enabled')return;
    const body=document.querySelector('[data-wdf-loan-body]');if(body)body.style.display=e.target.checked?'block':'none';
  },true);

  window.addEventListener('click',function(e){
    const day=e.target&&e.target.closest?e.target.closest('[data-wdf-save-day]'):null;if(day){e.preventDefault();e.stopPropagation();saveDay(day.getAttribute('data-wdf-save-day'),day);return;}
    const sec=e.target&&e.target.closest?e.target.closest('[data-wdf-save-section]'):null;if(sec){e.preventDefault();e.stopPropagation();saveSection(sec.getAttribute('data-wdf-save-section'),sec);return;}
    const finalBtn=e.target&&e.target.closest?e.target.closest('[data-wdf-final-submit]'):null;if(finalBtn){e.preventDefault();e.stopPropagation();finalSubmit(finalBtn);return;}
  },true);
})();