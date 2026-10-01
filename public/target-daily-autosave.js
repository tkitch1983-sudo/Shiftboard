(function(){
  'use strict';

  const timers=new Map();
  const revisions=new Map();
  let queue=Promise.resolve();

  function onTargets(){
    try{return !!(state&&state.admin&&state.admin.authed&&state.admin.tab==='targets');}catch(_e){return false;}
  }

  function keyFor(input){
    return String(input.dataset.targetActualSite||'')+'|'+String(input.dataset.targetActualDate||'');
  }

  function monthNow(){
    try{return state.admin.targetMonth||new Date().toISOString().slice(0,7);}catch(_e){return new Date().toISOString().slice(0,7);}
  }

  function allowedSite(siteId){
    try{
      if(state.admin.role==='super')return true;
      return state.admin.role==='site'&&String(state.admin.scopeSite||'')===String(siteId||'');
    }catch(_e){return false;}
  }

  function statusEl(input){
    if(!input||!input.parentElement)return null;
    let el=Array.from(input.parentElement.querySelectorAll('[data-target-autosave-status]')).find(function(x){return x.getAttribute('data-target-autosave-status')===keyFor(input);})||null;
    if(!el){
      el=document.createElement('div');
      el.setAttribute('data-target-autosave-status',keyFor(input));
      el.style.cssText='font-size:9px;line-height:1.2;margin-top:3px;min-height:11px;text-align:right;white-space:nowrap;';
      input.insertAdjacentElement('afterend',el);
    }
    return el;
  }

  function paint(input,stateName,message){
    const el=statusEl(input);if(!el)return;
    input.style.transition='border-color .15s ease,box-shadow .15s ease';
    if(stateName==='saving'){
      input.style.borderColor='var(--amber)';input.style.boxShadow='0 0 0 1px var(--amber-dim)';
      el.style.color='var(--amber)';el.textContent=message||'Saving…';
    }else if(stateName==='saved'){
      input.style.borderColor='var(--green)';input.style.boxShadow='0 0 0 1px var(--green-dim)';
      el.style.color='var(--green)';el.textContent=message||'✓ Auto-saved';
    }else if(stateName==='error'){
      input.style.borderColor='var(--red)';input.style.boxShadow='0 0 0 1px var(--red-dim)';
      el.style.color='var(--red)';el.textContent=message||'Not saved';
    }else{
      input.style.borderColor='';input.style.boxShadow='';el.textContent='';
    }
  }

  function parse(input){
    const raw=String(input.value||'').trim();
    if(raw==='')return {ok:true,raw:'',value:''};
    const n=Number(raw);
    if(!Number.isFinite(n)||n<0)return {ok:false,raw:raw};
    return {ok:true,raw:raw,value:n};
  }

  async function saveOne(snapshot,input,revision){
    if(!onTargets()||!allowedSite(snapshot.siteId))return;
    let latest;
    try{ latest=await storageGet('targetSheets',{}); }
    catch(_e){ paint(input,'error','Save failed'); return; }
    if(!latest||typeof latest!=='object'||Array.isArray(latest))latest={};
    const plan=latest[snapshot.month];
    const sitePlan=plan&&plan.sites&&plan.sites[snapshot.siteId];
    const day=sitePlan&&Array.isArray(sitePlan.days)?sitePlan.days.find(function(d){return String(d.date)===snapshot.date;}):null;
    if(!plan||!sitePlan||!day){paint(input,'error','Sheet changed — refresh');return;}

    day.actual=snapshot.value;
    plan.updatedAt=Date.now();
    try{
      plan.updatedBy=(typeof _session!=='undefined'&&_session&&_session.email)?String(_session.email):String(state.admin.managerName||'');
    }catch(_e){}
    latest[snapshot.month]=plan;

    let ok=false;
    try{ok=!!(await storageSet('targetSheets',latest));}catch(_e){ok=false;}
    if(!ok){paint(input,'error','Save failed — retry');return;}

    try{state.targetSheets=latest;}catch(_e){}
    const currentRevision=revisions.get(snapshot.key)||0;
    const currentRaw=String(input.value||'').trim();
    if(currentRevision===revision&&currentRaw===snapshot.raw){
      input.defaultValue=input.value;
      paint(input,'saved','✓ Auto-saved');
    }
  }

  function schedule(input,immediate){
    if(!onTargets()||!input||!allowedSite(input.dataset.targetActualSite))return;
    const parsed=parse(input),key=keyFor(input);
    if(!parsed.ok){paint(input,'error','Enter 0 or more');return;}
    const revision=(revisions.get(key)||0)+1;revisions.set(key,revision);
    if(timers.has(key)){clearTimeout(timers.get(key));timers.delete(key);}
    paint(input,'saving','Saving…');
    const run=function(){
      timers.delete(key);
      const snapshot={key:key,month:monthNow(),siteId:String(input.dataset.targetActualSite||''),date:String(input.dataset.targetActualDate||''),raw:parsed.raw,value:parsed.value};
      queue=queue.catch(function(){}).then(function(){return saveOne(snapshot,input,revision);});
    };
    if(immediate)run();else timers.set(key,setTimeout(run,650));
  }

  function decorate(){
    if(!onTargets())return;
    document.querySelectorAll('[data-target-actual-site][data-target-actual-date]').forEach(function(input){
      if(input.dataset.targetAutosaveReady==='1')return;
      input.dataset.targetAutosaveReady='1';
      input.title='Auto-saves. You can change this figure at any time.';
      statusEl(input);
    });
    const output=document.getElementById('target-sheet-output');
    if(output&&!document.querySelector('[data-target-autosave-note]')&&document.querySelector('[data-target-actual-site]')){
      const note=document.createElement('div');note.setAttribute('data-target-autosave-note','1');
      note.className='no-print';
      note.style.cssText='font-size:11px;color:var(--green);margin:0 0 8px;text-align:right;';
      note.textContent='Daily Actual figures auto-save — edit a figure again to correct it.';
      output.insertAdjacentElement('beforebegin',note);
    }
  }

  document.addEventListener('input',function(event){
    const input=event.target&&event.target.matches&&event.target.matches('[data-target-actual-site][data-target-actual-date]')?event.target:null;
    if(input)schedule(input,false);
  },true);
  document.addEventListener('change',function(event){
    const input=event.target&&event.target.matches&&event.target.matches('[data-target-actual-site][data-target-actual-date]')?event.target:null;
    if(input)schedule(input,true);
  },true);
  document.addEventListener('blur',function(event){
    const input=event.target&&event.target.matches&&event.target.matches('[data-target-actual-site][data-target-actual-date]')?event.target:null;
    if(input)schedule(input,true);
  },true);

  const observer=new MutationObserver(function(){setTimeout(decorate,40);});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',decorate);
  setInterval(decorate,5000);
  setTimeout(decorate,250);
})();
