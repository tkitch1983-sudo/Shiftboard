(function(){
  'use strict';

  const TAB='weeklychecks';
  const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const AREAS=['reception','office','toilets','mess'];
  let queue=Promise.resolve();
  let pending=0;
  let lastHydrateKey='';
  let lastHydrateAt=0;
  let hydrateTimer=null;

  function onWeekly(){
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
  function mondayIso(){
    const d=new Date(),diff=(d.getDay()+6)%7;
    d.setHours(12,0,0,0);d.setDate(d.getDate()-diff);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function jsonObj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
  function cleanDayKey(v){
    const s=String(v||'').toLowerCase();
    return DAYS.find(function(d){return d.toLowerCase()===s;})||'';
  }
  function parseField(id){
    const m=String(id||'').match(/^wdf-clean-(monday|tuesday|wednesday|thursday|friday|saturday)-(reception|office|toilets|mess|signature)$/i);
    if(!m)return null;
    return {day:cleanDayKey(m[1]),field:String(m[2]).toLowerCase()};
  }
  function complete(form){
    const days=jsonObj(form&&form.days);
    return DAYS.every(function(day){
      const d=jsonObj(days[day]);
      return AREAS.every(function(a){return !!String(d[a]||'').trim();})&&!!String(d.signature||'').trim();
    });
  }
  async function fetchRow(sid){
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(sid)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
    const res=await fetch(url,{headers:headers,cache:'no-store'});
    if(!res.ok)throw new Error('Weekly checks '+res.status);
    const rows=await res.json();
    return rows[0]||null;
  }
  async function writeField(snapshot){
    const sid=snapshot.siteId;
    let row=await fetchRow(sid);
    const oldForm=jsonObj(row&&row.site_cleaning_form);
    const days=Object.assign({},jsonObj(oldForm.days));
    const day=Object.assign({},jsonObj(days[snapshot.day]));
    day[snapshot.field]=snapshot.value;
    days[snapshot.day]=day;
    const form={version:Math.max(2,Number(oldForm.version)||0),days:days,notes:String(oldForm.notes||'')};
    const patch={site_cleaning_form:form,site_cleaning_done:complete(form)};
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
      headers['Prefer']='resolution=merge-duplicates,return=representation';
      res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?on_conflict=site_id,week_start',{
        method:'POST',headers:headers,body:JSON.stringify(payload)
      });
    }
    if(!res.ok){
      const msg=await res.text().catch(function(){return '';});
      throw new Error(msg||('Save failed ('+res.status+')'));
    }
    const rows=await res.json().catch(function(){return [];});
    return rows&&rows[0]?rows[0]:await fetchRow(sid);
  }
  function statusFor(el){
    if(!el||!el.parentElement)return null;
    let s=el.parentElement.querySelector('[data-wcn-save-status]');
    if(!s){
      s=document.createElement('div');
      s.setAttribute('data-wcn-save-status','1');
      s.style.cssText='font-size:9px;line-height:1.2;min-height:11px;margin-top:3px;white-space:nowrap;';
      el.insertAdjacentElement('afterend',s);
    }
    return s;
  }
  function paint(el,kind,msg){
    const s=statusFor(el);if(!s)return;
    el.style.transition='border-color .15s ease,box-shadow .15s ease';
    if(kind==='saving'){
      el.style.borderColor='var(--amber)';el.style.boxShadow='0 0 0 1px var(--amber-dim)';
      s.style.color='var(--amber)';s.textContent=msg||'Saving…';
    }else if(kind==='saved'){
      el.style.borderColor='var(--green)';el.style.boxShadow='0 0 0 1px var(--green-dim)';
      s.style.color='var(--green)';s.textContent=msg||'✓ Saved';
      window.setTimeout(function(){if(document.contains(el)){el.style.borderColor='';el.style.boxShadow='';if(s)s.textContent='';}},1800);
    }else{
      el.style.borderColor='var(--red)';el.style.boxShadow='0 0 0 1px var(--red-dim)';
      s.style.color='var(--red)';s.textContent=msg||'Not saved';
    }
  }
  function ensureOption(select,value){
    if(!select||!value)return;
    const exists=Array.from(select.options||[]).some(function(o){return String(o.value)===String(value);});
    if(exists)return;
    const group=document.createElement('optgroup');group.label='Saved value';
    const o=document.createElement('option');o.value=value;o.textContent=value;group.appendChild(o);
    select.appendChild(group);
  }
  function hydrateRow(row){
    if(!row||pending>0||!onWeekly())return;
    const form=jsonObj(row.site_cleaning_form),days=jsonObj(form.days);
    DAYS.forEach(function(day){
      const d=jsonObj(days[day]),k=day.toLowerCase();
      AREAS.concat(['signature']).forEach(function(field){
        const saved=String(d[field]||'').trim();
        if(!saved)return;
        const el=document.getElementById('wdf-clean-'+k+'-'+field);
        if(!el||document.activeElement===el||String(el.value||'').trim())return;
        ensureOption(el,saved);el.value=saved;
      });
    });
  }
  async function hydrate(force){
    if(!onWeekly()||pending>0)return;
    const sid=siteId();if(!sid)return;
    const key=sid+'|'+mondayIso(),now=Date.now();
    if(!force&&key===lastHydrateKey&&now-lastHydrateAt<5000)return;
    lastHydrateKey=key;lastHydrateAt=now;
    try{hydrateRow(await fetchRow(sid));}catch(_e){}
  }
  function scheduleHydrate(force,delay){
    clearTimeout(hydrateTimer);
    hydrateTimer=setTimeout(function(){hydrate(!!force);},delay==null?180:delay);
  }

  document.addEventListener('change',function(event){
    const el=event.target;
    if(!el||el.tagName!=='SELECT'||!onWeekly())return;
    const field=parseField(el.id);if(!field)return;
    const sid=siteId();if(!sid)return;
    const snapshot={siteId:sid,day:field.day,field:field.field,value:String(el.value||'').trim()};
    pending++;paint(el,'saving','Saving…');
    queue=queue.catch(function(){}).then(async function(){
      try{
        const row=await writeField(snapshot);
        paint(el,'saved','✓ Saved');
        lastHydrateKey=sid+'|'+mondayIso();lastHydrateAt=Date.now();
        pending=Math.max(0,pending-1);
        hydrateRow(row);
      }catch(err){
        pending=Math.max(0,pending-1);
        paint(el,'error','Not saved');
        try{if(typeof showToast==='function')showToast('Could not save cleaning name — '+(err&&err.message?err.message:'connection problem'),true);}catch(_e){}
      }
    });
  },true);

  const observer=new MutationObserver(function(){
    if(onWeekly())scheduleHydrate(false,220);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',function(){scheduleHydrate(true,100);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')scheduleHydrate(true,100);});
  setTimeout(function(){scheduleHydrate(true,0);},300);
})();