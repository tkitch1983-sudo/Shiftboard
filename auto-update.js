(function(){
  'use strict';
  if(!('serviceWorker' in navigator)) return;

  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const RELOAD_KEY = 'shiftboard-last-auto-reloaded-worker';
  const editedControls = new Set();
  let reloadStarted = false;
  let pendingVersion = null;

  function markEdited(event){
    if(!event || event.isTrusted===false) return;
    const el=event.target;
    if(el && el.matches && el.matches('input, textarea, select')) editedControls.add(el);
  }
  document.addEventListener('input',markEdited,true);
  document.addEventListener('change',markEdited,true);

  function hasUnsavedUserEdits(){
    let dirty=false;
    editedControls.forEach(el=>{
      if(!document.contains(el)){ editedControls.delete(el); return; }
      if(el.disabled || el.readOnly) return;
      const tag=String(el.tagName||'').toLowerCase();
      const type=String(el.type||'').toLowerCase();
      if(tag==='select'){
        if(Array.from(el.options||[]).some(o=>o.selected!==o.defaultSelected)) dirty=true;
        return;
      }
      if(type==='checkbox' || type==='radio'){
        if(el.checked!==el.defaultChecked) dirty=true;
        return;
      }
      if(type==='file'){
        if(el.files && el.files.length) dirty=true;
        return;
      }
      if(['button','submit','reset','hidden'].includes(type)) return;
      if(String(el.value??'')!==String(el.defaultValue??'')) dirty=true;
    });
    return dirty;
  }

  function storedVersion(){
    try{ return sessionStorage.getItem(RELOAD_KEY); }catch(_e){}
    try{ return localStorage.getItem(RELOAD_KEY); }catch(_e){}
    return null;
  }
  function rememberVersion(version){
    try{ sessionStorage.setItem(RELOAD_KEY,version); return true; }catch(_e){}
    try{ localStorage.setItem(RELOAD_KEY,version); return true; }catch(_e){}
    return false;
  }

  function tryApplyUpdate(){
    if(reloadStarted || !pendingVersion || hasUnsavedUserEdits()) return;
    if(storedVersion()===pendingVersion){ pendingVersion=null; return; }
    // If the browser cannot persist a reload guard, never risk a reload loop.
    if(!rememberVersion(pendingVersion)) return;
    reloadStarted=true;
    window.location.reload();
  }

  function workerVersion(worker){
    if(!worker || typeof MessageChannel==='undefined') return Promise.resolve(null);
    return new Promise(resolve=>{
      const channel=new MessageChannel();
      let done=false;
      const finish=(version)=>{
        if(done) return;
        done=true;
        clearTimeout(timeout);
        channel.port1.close();
        resolve(typeof version==='string' && version ? version : null);
      };
      const timeout=setTimeout(()=>finish(null),1200);
      channel.port1.onmessage=e=>finish(e && e.data && e.data.version);
      try{worker.postMessage({type:'SHIFTBOARD_GET_VERSION'},[channel.port2]);}
      catch(_e){finish(null);}
    });
  }

  async function onControllerChanged(){
    const version=await workerVersion(navigator.serviceWorker.controller);
    if(!version || version===storedVersion()) return;
    pendingVersion=version;
    tryApplyUpdate();
  }

  async function checkForUpdate(){
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      if(!reg) return;
      await reg.update();
      if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    }catch(_e){}
  }

  // Updates still apply automatically, but at most once per installed worker version.
  // A staff member entering data is not interrupted in the middle of an edit.
  navigator.serviceWorker.addEventListener('controllerchange',onControllerChanged);
  navigator.serviceWorker.ready.then(reg=>{
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker) return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed' && reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      });
    });
  }).catch(()=>{});

  window.setInterval(checkForUpdate,CHECK_EVERY_MS);
  window.setInterval(tryApplyUpdate,15000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){ tryApplyUpdate(); checkForUpdate(); }
  });
  window.addEventListener('focus',()=>{ tryApplyUpdate(); checkForUpdate(); });
  window.setTimeout(checkForUpdate,5000);
})();
