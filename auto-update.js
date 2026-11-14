(function(){
  'use strict';

  if(!('serviceWorker' in navigator)) return;

  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const editedControls = new Set();
  let updatePending = false;
  let reloadStarted = false;
  let banner = null;

  function markEdited(event){
    if(!event || event.isTrusted===false) return;
    const el=event.target;
    if(el && el.matches && el.matches('input, textarea, select')) editedControls.add(el);
  }

  document.addEventListener('input', markEdited, true);
  document.addEventListener('change', markEdited, true);

  function hasUnsavedUserEdits(){
    let dirty=false;
    editedControls.forEach(el=>{
      if(!document.contains(el)){
        editedControls.delete(el);
        return;
      }
      if(el.disabled || el.readOnly) return;
      const tag=String(el.tagName||'').toLowerCase();
      const type=String(el.type||'').toLowerCase();
      if(tag==='select'){
        const changed=Array.from(el.options||[]).some(o=>o.selected!==o.defaultSelected);
        if(changed) dirty=true;
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

  function removeBanner(){
    if(banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner=null;
  }

  function showBanner(){
    if(banner || !document.body) return;
    banner=document.createElement('div');
    banner.id='shiftboard-update-banner';
    banner.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;z-index:2147483647;background:#151516;color:#f7f7f8;border:1px solid #e2222d;border-left:5px solid #e2222d;box-shadow:0 10px 30px rgba(0,0,0,.45);padding:12px 14px;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
    const text=document.createElement('div');
    text.innerHTML='<b style="display:block;font-size:13px;">Shiftboard update available</b><span style="display:block;margin-top:3px;font-size:11px;color:#b4b6b8;">Shiftboard will not reload automatically. Save your work, then choose Reload update.</span>';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='Reload update';
    button.style.cssText='background:#e2222d;color:#fff;border:1px solid #e2222d;padding:9px 13px;font-weight:700;cursor:pointer;';
    button.addEventListener('click',startReload);
    banner.append(text,button);
    document.body.appendChild(banner);
  }

  function startReload(){
    // Only called from an explicit press of the Reload update button.
    if(reloadStarted) return;
    if(hasUnsavedUserEdits() && !window.confirm('You may have unsaved changes. Reload Shiftboard anyway?')) return;
    reloadStarted=true;
    removeBanner();
    window.location.reload();
  }

  async function checkForUpdate(){
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      if(!reg) return;
      await reg.update();
      if(reg.waiting){
        updatePending=true;
        showBanner();
      }
    }catch(_e){}
  }

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    // A new worker must never force an unexpected reload (especially on kiosks).
    updatePending=true;
    showBanner();
  });

  navigator.serviceWorker.ready.then(reg=>{
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker) return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed' && navigator.serviceWorker.controller && hasUnsavedUserEdits()){
          updatePending=true;
          showBanner();
        }
      });
    });
  }).catch(()=>{});

  window.setInterval(checkForUpdate,CHECK_EVERY_MS);

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') checkForUpdate();
  });
  window.addEventListener('focus',checkForUpdate);
  window.setTimeout(checkForUpdate,5000);
})();
