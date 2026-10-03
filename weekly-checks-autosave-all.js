(function(){
  'use strict';

  const TAB='weeklychecks';
  const BUCKET='weekly-checks';
  const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const AREAS=['reception','office','toilets','mess'];
  const OXY_ITEMS=['cylinders_upright','cylinder_key','fire_gloves','ppe_suitable','regulators_type_date','connection_nuts','oxygen_regulator_clean','flashback_arrestors','hoses_good','clips_factory','spliced_hoses_checked','torch_condition','nozzle_seated'];
  const CAR_ITEMS=['rubbish','dashboard','centre_console','doors_pockets','steering_wheel','gear_stick','seats_wipe','carpets','seats_hoover','mats','boot_space','outside','wheels_trims','windows','wipers'];
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp','csv','xls','xlsx']);
  const MAX_FILE_BYTES=20*1024*1024;

  const timers=new Map();
  let queue=Promise.resolve();
  let hydrateBusy=false;
  let userSaving=0;
  let lastHydratedKey='';
  let lastHydratedAt=0;

  function weeklyOpen(){
    try{return !!(state&&state.admin&&state.admin.authed&&state.admin.tab===TAB&&document.getElementById('weekly-check-form'));}catch(_e){return false;}
  }
  function siteId(){
    try{
      const form=document.getElementById('weekly-check-form');
      if(form&&form.dataset.siteId)return String(form.dataset.siteId);
      if(!state||!state.admin)return '';
      return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
    }catch(_e){return '';}
  }
  function site(){
    try{
      const sid=siteId();
      return ((state.config&&state.config.sites)||[]).find(function(s){return String(s.id)===sid;})||null;
    }catch(_e){return null;}
  }
  function loanCarsApply(s){
    const n=String(s&&s.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    return n.indexOf('gateshead')>=0||n.indexOf('chester le street')>=0;
  }
  function isoLocal(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function mondayIso(){
    const d=new Date(),diff=(d.getDay()+6)%7;
    d.setHours(12,0,0,0);d.setDate(d.getDate()-diff);return isoLocal(d);
  }
  function jsonObj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
  function valueOf(el){return el?(el.type==='checkbox'?!!el.checked:String(el.value||'').trim()):'';}
  function fileExt(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
  function cleanName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
  function storagePath(path){return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');}
  function mimeFor(file){
    if(file.type)return file.type;
    const e=fileExt(file.name);
    if(e==='pdf')return 'application/pdf';
    if(e==='jpg'||e==='jpeg')return 'image/jpeg';
    if(e==='png')return 'image/png';
    if(e==='webp')return 'image/webp';
    if(e==='csv')return 'text/csv';
    if(e==='xls')return 'application/vnd.ms-excel';
    if(e==='xlsx')return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }

  async function fetchRow(sid){
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(sid)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
    const res=await fetch(url,{headers:headers,cache:'no-store'});
    if(!res.ok)throw new Error('Weekly checks '+res.status);
    const rows=await res.json();return rows[0]||null;
  }
  async function savePatch(sid,patch){
    let row=await fetchRow(sid);
    const headers=await authHeaders();
    headers['Content-Type']='application/json';
    headers['Prefer']='return=representation';
    let res;
    if(row&&row.id){
      res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?id=eq.'+encodeURIComponent(row.id),{
        method:'PATCH',headers:headers,body:JSON.stringify(patch)
      });
    }else{
      const payload=Object.assign({site_id:sid,week_start:mondayIso()},patch);
      res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks',{
        method:'POST',headers:headers,body:JSON.stringify(payload)
      });
      if(res.status===409){
        row=await fetchRow(sid);
        if(row&&row.id){
          res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?id=eq.'+encodeURIComponent(row.id),{
            method:'PATCH',headers:headers,body:JSON.stringify(patch)
          });
        }
      }
    }
    if(!res.ok){
      const msg=await res.text().catch(function(){return '';});
      throw new Error(msg||('Save failed ('+res.status+')'));
    }
    const rows=await res.json().catch(function(){return [];});
    return rows&&rows[0]?rows[0]:await fetchRow(sid);
  }

  function cleaningComplete(form){
    const days=jsonObj(form&&form.days);
    return DAYS.every(function(day){
      const d=jsonObj(days[day]);
      return AREAS.every(function(a){return !!String(d[a]||'').trim();})&&!!String(d.signature||'').trim();
    });
  }
  function oxyComplete(form){
    form=jsonObj(form);
    const answers=jsonObj(form.answers),notes=jsonObj(form.item_notes);
    if(!String(form.completed_by||'').trim())return false;
    if(OXY_ITEMS.some(function(k){return !String(answers[k]||'').trim();}))return false;
    const no=OXY_ITEMS.filter(function(k){return String(answers[k]||'')==='no';});
    if(no.length&&!String(form.notes||'').trim()&&!no.some(function(k){return !!String(notes[k]||'').trim();}))return false;
    return true;
  }
  function carComplete(form){
    form=jsonObj(form);
    if(typeof form.enabled!=='boolean'){
      if(form.no_cars===true)return true;
      if(!Object.keys(form).length)return false;
    }
    if(form.enabled===false)return true;
    const cars=Array.isArray(form.cars)?form.cars:[];
    const first=jsonObj(cars[0]);
    if(!String(form.completed_by||'').trim()||!String(first.reg||'').trim())return false;
    for(let i=0;i<cars.length;i++){
      const car=jsonObj(cars[i]);if(!String(car.reg||'').trim())continue;
      const items=jsonObj(car.items);
      if(CAR_ITEMS.some(function(k){return !String(items[k]||'').trim();}))return false;
    }
    return true;
  }
  function rowComplete(row,siteOverride){
    if(!row)return false;
    const s=siteOverride||site();
    const stock=Array.isArray(row.stock_files)&&row.stock_files.length>0;
    return !!(
      row.weekly_timesheet_done &&
      cleaningComplete(row.site_cleaning_form) &&
      stock &&
      oxyComplete(row.oxy_acetylene_form) &&
      (!loanCarsApply(s)||carComplete(row.car_cleaning_form))
    );
  }

  function statusEl(){
    let el=document.querySelector('[data-wca-status]');
    if(el)return el;
    const form=document.getElementById('weekly-check-form');
    if(!form)return null;
    el=document.createElement('div');
    el.setAttribute('data-wca-status','1');
    el.style.cssText='margin:0 0 12px;padding:9px 11px;border:1px solid var(--line-soft);border-left:4px solid var(--green);font-size:12px;color:var(--muted);';
    el.innerHTML='<b style="color:var(--green);">Auto-save on</b> · Every weekly-check field is saved as it is entered.';
    form.insertBefore(el,form.firstChild);
    return el;
  }
  function paintGlobal(kind,msg){
    const el=statusEl();if(!el)return;
    const b=el.querySelector('b');
    if(kind==='saving'){el.style.borderLeftColor='var(--amber)';if(b){b.style.color='var(--amber)';b.textContent='Saving…';}}
    else if(kind==='error'){el.style.borderLeftColor='var(--red)';if(b){b.style.color='var(--red)';b.textContent='Not saved';}}
    else{el.style.borderLeftColor='var(--green)';if(b){b.style.color='var(--green)';b.textContent=msg||'✓ Auto-saved';}}
  }
  function paintControl(el,kind){
    if(!el)return;
    el.style.transition='border-color .15s ease,box-shadow .15s ease';
    if(kind==='saving'){el.style.borderColor='var(--amber)';el.style.boxShadow='0 0 0 1px var(--amber-dim)';}
    else if(kind==='error'){el.style.borderColor='var(--red)';el.style.boxShadow='0 0 0 1px var(--red-dim)';}
    else{
      el.style.borderColor='var(--green)';el.style.boxShadow='0 0 0 1px var(--green-dim)';
      setTimeout(function(){if(document.contains(el)){el.style.borderColor='';el.style.boxShadow='';}},1400);
    }
  }

  function ensureOption(el,val){
    if(!el||el.tagName!=='SELECT'||!val)return;
    if(Array.from(el.options||[]).some(function(o){return String(o.value)===String(val);}))return;
    const group=document.createElement('optgroup');group.label='Saved value';
    const opt=document.createElement('option');opt.value=val;opt.textContent=val;group.appendChild(opt);el.appendChild(group);
  }
  function setValue(id,val){
    const el=document.getElementById(id);if(!el||document.activeElement===el)return;
    if(el.type==='checkbox'){el.checked=!!val;return;}
    val=val==null?'':String(val);
    ensureOption(el,val);el.value=val;
  }

  function hydrate(row){
    if(!weeklyOpen()||!row||userSaving>0)return;
    hydrateBusy=true;
    try{
      setValue('wc-timesheet',!!row.weekly_timesheet_done);
      setValue('wc-flag',row.flag_status||'ok');
      setValue('wc-mot',row.mot_log_status||'up_to_date');
      setValue('wc-maint',row.maintenance_status||'OK');
      setValue('wc-vehicles',row.vehicles_left_status||'No vehicles left on site');
      setValue('wc-alarm',row.alarm_callout_status||'Not required');
      setValue('wc-notes',row.notes||'');

      const clean=jsonObj(row.site_cleaning_form),days=jsonObj(clean.days);
      DAYS.forEach(function(day){
        const d=jsonObj(days[day]),k=day.toLowerCase();
        AREAS.forEach(function(a){setValue('wdf-clean-'+k+'-'+a,d[a]||'');});
        setValue('wdf-clean-'+k+'-signature',d.signature||'');
      });
      setValue('wdf-clean-notes',clean.notes||'');

      const oxy=jsonObj(row.oxy_acetylene_form),answers=jsonObj(oxy.answers),itemNotes=jsonObj(oxy.item_notes);
      OXY_ITEMS.forEach(function(k){setValue('wdf-oxy-'+k,answers[k]||'');setValue('wdf-oxy-note-'+k,itemNotes[k]||'');});
      setValue('wdf-oxy-by',oxy.completed_by||'');
      setValue('wdf-oxy-date',oxy.completed_date||'');
      setValue('wdf-oxy-notes',oxy.notes||'');

      const car=jsonObj(row.car_cleaning_form),cars=Array.isArray(car.cars)?car.cars:[];
      if(document.getElementById('wdf-loan-enabled')){
        const enabled=typeof car.enabled==='boolean'?car.enabled:(car.no_cars===true?false:cars.some(function(x){return x&&x.reg;}));
        setValue('wdf-loan-enabled',enabled);
        const body=document.querySelector('[data-wdf-loan-body]');if(body)body.style.display=enabled?'block':'none';
      }
      cars.slice(0,2).forEach(function(carRow,i){
        carRow=jsonObj(carRow);setValue('wdf-car-'+i+'-reg',carRow.reg||'');
        const items=jsonObj(carRow.items);CAR_ITEMS.forEach(function(k){setValue('wdf-car-'+i+'-'+k,items[k]||'');});
      });
      setValue('wdf-car-by',car.completed_by||'');
      setValue('wdf-car-date',car.completed_date||'');
      setValue('wdf-car-notes',car.notes||'');

      const stockInput=document.getElementById('wc-stock-files');
      if(stockInput&&stockInput.parentElement){
        let list=stockInput.parentElement.querySelector('[data-wca-stock-list]');
        if(!list){list=document.createElement('div');list.setAttribute('data-wca-stock-list','1');list.style.cssText='font-size:11px;color:var(--muted);margin-top:7px;';stockInput.insertAdjacentElement('afterend',list);}
        const files=Array.isArray(row.stock_files)?row.stock_files:[];
        list.textContent=files.length?'Saved stock sheet'+(files.length===1?'':'s')+': '+files.map(function(f){return f.name||'file';}).join(', '):'No stock sheet saved yet.';
      }

      const form=document.getElementById('weekly-check-form'),card=form&&form.closest('.card'),complete=rowComplete(row);
      if(card){
        const pill=card.querySelector('.pill');
        if(pill){pill.className='pill '+(complete?'pill-approved':'pill-pending');pill.textContent=complete?'SUBMITTED':'DRAFT SAVED';}
      }
      paintGlobal('saved',complete?'✓ All checks saved':'✓ Draft auto-saved');
    }finally{hydrateBusy=false;}
  }

  async function refreshSuperSummary(){
    try{
      if(!weeklyOpen()||!state||!state.admin||state.admin.role!=='super')return;
      const buttons=Array.from(document.querySelectorAll('[data-weekly-site]'));
      if(!buttons.length)return;
      const headers=await authHeaders();
      const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(mondayIso());
      const res=await fetch(url,{headers:headers,cache:'no-store'});if(!res.ok)return;
      const rows=await res.json(),byId=new Map(rows.map(function(r){return [String(r.site_id),r];}));
      let done=0;
      buttons.forEach(function(btn){
        const sid=String(btn.getAttribute('data-weekly-site')||''),row=byId.get(sid)||null;
        const s=((state.config&&state.config.sites)||[]).find(function(x){return String(x.id)===sid;})||null;
        const complete=rowComplete(row,s),draft=!!row&&!complete;
        if(complete)done++;
        const tr=btn.closest('tr');if(!tr)return;
        const pill=tr.querySelector('.pill');
        if(pill){pill.className='pill '+(complete?'pill-approved':draft?'pill-pending':'pill-rejected');pill.textContent=complete?'Done':draft?'Draft':'Not done';}
        if(tr.cells&&tr.cells[2])tr.cells[2].textContent=row&&row.submitted_at?new Date(row.submitted_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
        if(tr.cells&&tr.cells[3])tr.cells[3].textContent=row&&row.submitted_by_email?row.submitted_by_email:'—';
      });
      const first=buttons[0]&&buttons[0].closest('.card');
      if(first){
        const counter=Array.from(first.querySelectorAll('div')).find(function(d){return /of\s+\d+\s+(?:workshops\s+)?completed/i.test(d.textContent||'');});
        if(counter)counter.innerHTML='<b>'+done+'</b> of <b>'+buttons.length+'</b> workshops completed';
      }
    }catch(_e){}
  }

  async function refresh(force){
    if(!weeklyOpen()||userSaving>0)return;
    const sid=siteId();if(!sid)return;
    const key=sid+'|'+mondayIso(),now=Date.now();
    if(!force&&key===lastHydratedKey&&now-lastHydratedAt<4000)return;
    lastHydratedKey=key;lastHydratedAt=now;
    try{hydrate(await fetchRow(sid));}catch(_e){}
    refreshSuperSummary();
  }

  function managerPatch(id,val){
    if(id==='wc-timesheet')return {weekly_timesheet_done:!!val};
    if(id==='wc-flag')return {flag_status:String(val||'ok')};
    if(id==='wc-mot')return {mot_log_status:String(val||'up_to_date')};
    if(id==='wc-maint')return {maintenance_status:String(val||'OK')||'OK'};
    if(id==='wc-vehicles')return {vehicles_left_status:String(val||'No vehicles left on site')||'No vehicles left on site'};
    if(id==='wc-alarm')return {alarm_callout_status:String(val||'Not required')||'Not required'};
    if(id==='wc-notes')return {notes:String(val||'')};
    return null;
  }
  function parseCleaning(id){
    if(id==='wdf-clean-notes')return {kind:'notes'};
    const m=String(id||'').match(/^wdf-clean-(monday|tuesday|wednesday|thursday|friday|saturday)-(reception|office|toilets|mess|signature)$/i);
    if(!m)return null;
    const day=DAYS.find(function(d){return d.toLowerCase()===m[1].toLowerCase();});
    return {kind:'field',day:day,field:m[2].toLowerCase()};
  }
  function parseOxy(id){
    if(id==='wdf-oxy-by')return {kind:'completed_by'};
    if(id==='wdf-oxy-date')return {kind:'completed_date'};
    if(id==='wdf-oxy-notes')return {kind:'notes'};
    let m=String(id||'').match(/^wdf-oxy-note-(.+)$/);if(m&&OXY_ITEMS.indexOf(m[1])>=0)return {kind:'item_note',key:m[1]};
    m=String(id||'').match(/^wdf-oxy-(.+)$/);if(m&&OXY_ITEMS.indexOf(m[1])>=0)return {kind:'answer',key:m[1]};
    return null;
  }
  function parseCar(id){
    if(id==='wdf-loan-enabled')return {kind:'enabled'};
    if(id==='wdf-car-by')return {kind:'completed_by'};
    if(id==='wdf-car-date')return {kind:'completed_date'};
    if(id==='wdf-car-notes')return {kind:'notes'};
    let m=String(id||'').match(/^wdf-car-(0|1)-reg$/);if(m)return {kind:'reg',index:Number(m[1])};
    m=String(id||'').match(/^wdf-car-(0|1)-(.+)$/);if(m&&CAR_ITEMS.indexOf(m[2])>=0)return {kind:'item',index:Number(m[1]),key:m[2]};
    return null;
  }

  async function saveEvent(snapshot){
    const sid=snapshot.sid,row=await fetchRow(sid)||{};
    let patch=managerPatch(snapshot.id,snapshot.value);
    if(!patch){
      const cl=parseCleaning(snapshot.id);
      if(cl){
        const form=Object.assign({version:2},jsonObj(row.site_cleaning_form));
        const days=Object.assign({},jsonObj(form.days));
        if(cl.kind==='notes')form.notes=String(snapshot.value||'');
        else{
          const d=Object.assign({},jsonObj(days[cl.day]));d[cl.field]=String(snapshot.value||'');days[cl.day]=d;form.days=days;
        }
        patch={site_cleaning_form:form,site_cleaning_done:cleaningComplete(form)};
      }
    }
    if(!patch){
      const ox=parseOxy(snapshot.id);
      if(ox){
        const form=Object.assign({version:2},jsonObj(row.oxy_acetylene_form));
        if(ox.kind==='answer'){const a=Object.assign({},jsonObj(form.answers));a[ox.key]=String(snapshot.value||'');form.answers=a;}
        else if(ox.kind==='item_note'){const n=Object.assign({},jsonObj(form.item_notes));n[ox.key]=String(snapshot.value||'');form.item_notes=n;}
        else form[ox.kind]=String(snapshot.value||'');
        patch={oxy_acetylene_form:form,oxy_acetylene_done:oxyComplete(form)};
      }
    }
    if(!patch){
      const ca=parseCar(snapshot.id);
      if(ca){
        const form=Object.assign({version:2},jsonObj(row.car_cleaning_form));
        if(ca.kind==='enabled'){form.enabled=!!snapshot.value;form.no_cars=!snapshot.value;}
        else if(ca.kind==='reg'||ca.kind==='item'){
          const cars=Array.isArray(form.cars)?form.cars.slice():[];
          while(cars.length<2)cars.push({reg:'',items:{}});
          const car=Object.assign({},jsonObj(cars[ca.index]));
          if(ca.kind==='reg')car.reg=String(snapshot.value||'').toUpperCase();
          else{const items=Object.assign({},jsonObj(car.items));items[ca.key]=String(snapshot.value||'');car.items=items;}
          cars[ca.index]=car;form.cars=cars;
        }else form[ca.kind]=String(snapshot.value||'');
        patch={car_cleaning_form:form,car_cleaning_done:carComplete(form)};
      }
    }
    if(!patch)return row;
    return savePatch(sid,patch);
  }

  function schedule(el,immediate){
    if(!weeklyOpen()||hydrateBusy||!el||!el.id)return;
    const id=el.id,sid=siteId();if(!sid)return;
    const relevant=!!(managerPatch(id,valueOf(el))||parseCleaning(id)||parseOxy(id)||parseCar(id));
    if(!relevant)return;
    const key=sid+'|'+id;
    if(timers.has(key)){clearTimeout(timers.get(key));timers.delete(key);}
    paintGlobal('saving');paintControl(el,'saving');
    const snapshot={sid:sid,id:id,value:valueOf(el)};
    const run=function(){
      timers.delete(key);userSaving++;
      queue=queue.catch(function(){}).then(function(){return saveEvent(snapshot);}).then(function(row){
        paintControl(el,'saved');hydrate(row);
      }).catch(function(err){
        paintGlobal('error');paintControl(el,'error');
        try{if(typeof showToast==='function')showToast('Could not auto-save weekly check — '+(err&&err.message?err.message:'connection problem'),true);}catch(_e){}
      }).finally(function(){userSaving=Math.max(0,userSaving-1);});
    };
    if(immediate)run();else timers.set(key,setTimeout(run,650));
  }

  async function uploadOne(sid,file){
    const ext=fileExt(file.name);
    if(!ALLOWED_EXT.has(ext))throw new Error('Stock sheet must be PDF, image, CSV or Excel.');
    if(file.size>MAX_FILE_BYTES)throw new Error('Each stock sheet must be 20 MB or smaller.');
    const path=sid+'/'+mondayIso()+'/stocktake/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders();headers['Content-Type']=mimeFor(file);headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers:headers,body:file});
    if(!res.ok){const msg=await res.text().catch(function(){return '';});throw new Error(msg||('Stock upload failed ('+res.status+')'));}
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,category:'stocktake',uploadedAt:new Date().toISOString()};
  }
  async function autoUploadStock(input){
    if(!weeklyOpen()||!input||!input.files||!input.files.length)return;
    const sid=siteId();if(!sid)return;
    const chosen=Array.from(input.files);
    paintGlobal('saving','Uploading stock sheet…');paintControl(input,'saving');userSaving++;
    queue=queue.catch(function(){}).then(async function(){
      const row=await fetchRow(sid)||{},files=Array.isArray(row.stock_files)?row.stock_files.slice():[];
      for(const file of chosen)files.push(await uploadOne(sid,file));
      const saved=await savePatch(sid,{stock_files:files,stock_take_done:files.length>0});
      try{input.value='';}catch(_e){}
      paintControl(input,'saved');hydrate(saved);
    }).catch(function(err){
      paintGlobal('error');paintControl(input,'error');
      try{if(typeof showToast==='function')showToast('Could not auto-save stock sheet — '+(err&&err.message?err.message:'connection problem'),true);}catch(_e){}
    }).finally(function(){userSaving=Math.max(0,userSaving-1);});
  }

  document.addEventListener('change',function(e){
    const el=e.target;if(!el||!weeklyOpen())return;
    if(el.id==='wc-stock-files'){autoUploadStock(el);return;}
    schedule(el,true);
  },true);
  document.addEventListener('input',function(e){
    const el=e.target;if(!el||!weeklyOpen())return;
    if(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='file')return;
    schedule(el,false);
  },true);
  document.addEventListener('blur',function(e){
    const el=e.target;if(!el||!weeklyOpen())return;
    if(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='file')return;
    schedule(el,true);
  },true);

  const observer=new MutationObserver(function(){
    if(!weeklyOpen())return;
    statusEl();
    setTimeout(function(){refresh(false);},120);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',function(){refresh(true);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')refresh(true);});
  setInterval(function(){if(weeklyOpen())refresh(true);},10000);
  setTimeout(function(){if(weeklyOpen()){statusEl();refresh(true);}},350);
})();