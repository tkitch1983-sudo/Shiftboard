(function(){
  'use strict';

  const TAB='monthlyhs';
  let timer=null;
  let queue=Promise.resolve();
  let revision=0;
  let savingCount=0;

  function open(){
    try{return !!(state&&state.admin&&state.admin.authed&&state.admin.tab===TAB&&document.querySelector('[data-monthly-status]'));}catch(_e){return false;}
  }
  function currentMonth(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function month(){
    try{
      const input=document.getElementById('monthly-hs-month');
      return String((input&&input.value)||(state.admin&&state.admin.monthlyHsMonth)||currentMonth()).slice(0,7);
    }catch(_e){return currentMonth();}
  }
  function monthStart(){return month()+'-01';}
  function siteId(){
    try{
      if(!state||!state.admin)return '';
      if(state.admin.role==='site')return String(state.admin.scopeSite||'');
      const select=document.getElementById('monthly-hs-site');
      return String((select&&select.value)||state.admin.monthlyHsSite||'');
    }catch(_e){return '';}
  }
  function collect(){
    const checks={};
    document.querySelectorAll('[data-monthly-status]').forEach(function(sel){
      const key=String(sel.getAttribute('data-monthly-status')||'');
      if(!key)return;
      const note=document.querySelector('[data-monthly-note="'+key+'"]');
      const tr=sel.closest('tr'),first=tr&&tr.querySelector('td');
      const label=first&&first.textContent.trim()?first.textContent.trim():(key==='mot_qc'?'MOT QC':key);
      checks[key]={
        label:label,
        status:String(sel.value||''),
        note:note?String(note.value||'').trim():''
      };
    });
    const manager=document.getElementById('monthly-hs-manager-notes');
    return {checks:checks,managerNotes:manager?String(manager.value||'').trim():''};
  }
  async function fetchRow(sid,mstart){
    const headers=await authHeaders();
    const url=SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&site_id=eq.'+encodeURIComponent(sid)+'&month_start=eq.'+encodeURIComponent(mstart)+'&limit=1';
    const res=await fetch(url,{headers:headers,cache:'no-store'});
    if(!res.ok)throw new Error('Monthly H&S '+res.status);
    const rows=await res.json();
    return rows[0]||null;
  }
  function indicator(){
    let el=document.querySelector('[data-monthly-autosave-status]');
    if(el)return el;
    const toolbar=document.querySelector('[data-monthly-refresh]')&&document.querySelector('[data-monthly-refresh]').closest('.card');
    if(!toolbar)return null;
    el=document.createElement('span');
    el.setAttribute('data-monthly-autosave-status','1');
    el.style.cssText='margin-left:auto;font-size:11px;font-weight:700;white-space:nowrap;';
    toolbar.appendChild(el);
    return el;
  }
  function paint(kind,text){
    const el=indicator();if(!el)return;
    if(kind==='saving'){el.style.color='var(--amber)';el.textContent=text||'Saving…';}
    else if(kind==='saved'){el.style.color='var(--green)';el.textContent=text||'✓ Auto-saved';}
    else if(kind==='error'){el.style.color='var(--red)';el.textContent=text||'Not saved';}
    else{el.textContent='';}
  }
  function markControl(control,kind){
    if(!control)return;
    control.style.transition='border-color .15s ease,box-shadow .15s ease';
    if(kind==='saving'){
      control.style.borderColor='var(--amber)';
      control.style.boxShadow='0 0 0 1px var(--amber-dim)';
    }else if(kind==='saved'){
      control.style.borderColor='var(--green)';
      control.style.boxShadow='0 0 0 1px var(--green-dim)';
      setTimeout(function(){if(document.contains(control)){control.style.borderColor='';control.style.boxShadow='';}},1600);
    }else if(kind==='error'){
      control.style.borderColor='var(--red)';
      control.style.boxShadow='0 0 0 1px var(--red-dim)';
    }
  }
  async function persist(snapshot,control,myRevision){
    if(!snapshot.sid)return;
    const row=await fetchRow(snapshot.sid,snapshot.monthStart);
    const headers=await authHeaders();
    headers['Content-Type']='application/json';
    headers['Prefer']='resolution=merge-duplicates,return=representation';
    let res;
    if(row&&row.status==='published'){
      const patch={
        draft_checks:snapshot.form.checks,
        draft_manager_notes:snapshot.form.managerNotes
      };
      res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?id=eq.'+encodeURIComponent(row.id),{
        method:'PATCH',headers:headers,body:JSON.stringify(patch)
      });
    }else{
      const payload={
        site_id:snapshot.sid,
        month_start:snapshot.monthStart,
        checks:snapshot.form.checks,
        manager_notes:snapshot.form.managerNotes,
        status:'draft',
        draft_checks:null,
        draft_manager_notes:null
      };
      res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?on_conflict=site_id,month_start',{
        method:'POST',headers:headers,body:JSON.stringify(payload)
      });
    }
    if(!res.ok){
      const msg=await res.text().catch(function(){return '';});
      throw new Error(msg||('Save failed ('+res.status+')'));
    }
    if(myRevision===revision){
      paint('saved','✓ Auto-saved');
      markControl(control,'saved');
    }
  }
  function schedule(control,delay){
    if(!open())return;
    revision+=1;
    const myRevision=revision;
    clearTimeout(timer);
    paint('saving','Saving…');
    markControl(control,'saving');
    timer=setTimeout(function(){
      const snapshot={sid:siteId(),monthStart:monthStart(),form:collect()};
      savingCount++;
      queue=queue.catch(function(){}).then(function(){
        return persist(snapshot,control,myRevision);
      }).catch(function(err){
        paint('error','Not saved');
        markControl(control,'error');
        try{if(typeof showToast==='function')showToast('Could not auto-save Monthly H&S — '+(err&&err.message?err.message:'connection problem'),true);}catch(_e){}
      }).finally(function(){
        savingCount=Math.max(0,savingCount-1);
      });
    },delay);
  }
  function relevant(el){
    return !!(el&&(
      (el.matches&&el.matches('[data-monthly-status]'))||
      (el.matches&&el.matches('[data-monthly-note]'))||
      el.id==='monthly-hs-manager-notes'
    ));
  }
  function decorate(){
    if(!open())return;
    const save=document.querySelector('[data-monthly-save]');
    if(save&&!save.dataset.monthlyAutosaveLabel){
      save.dataset.monthlyAutosaveLabel='1';
      save.textContent='Save now';
      save.title='Monthly H&S fields auto-save as you work. Use this only if you want to force a save immediately.';
    }
    indicator();
  }

  document.addEventListener('change',function(e){
    const el=e.target;if(!relevant(el))return;
    schedule(el,60);
  },true);
  document.addEventListener('input',function(e){
    const el=e.target;if(!relevant(el)||el.matches('[data-monthly-status]'))return;
    schedule(el,700);
  },true);
  document.addEventListener('blur',function(e){
    const el=e.target;if(!relevant(el)||el.matches('[data-monthly-status]'))return;
    schedule(el,60);
  },true);

  const observer=new MutationObserver(function(){setTimeout(decorate,40);});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',decorate);
  setInterval(decorate,5000);
  setTimeout(decorate,250);
})();