(function(){
  'use strict';

  const MODE_KEY='sb_kiosk_mode_enabled_v1';
  const HASH_KEY='sb_kiosk_unlock_hash_v1';
  const SALT_KEY='sb_kiosk_unlock_salt_v1';
  const UNLOCK_UNTIL='sb_kiosk_unlocked_until';
  const FAIL_COUNT='sb_kiosk_pin_fail_count';
  const BLOCK_UNTIL='sb_kiosk_pin_block_until';
  const UNLOCK_MS=10*60*1000;
  let holdTimer=null;
  let modal=null;
  let controls=null;

  function tabletLike(){
    const ua=String(navigator.userAgent||'');
    const touch=Number(navigator.maxTouchPoints||0)>0;
    const ipad=/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints||0)>1);
    const androidTablet=/Android/i.test(ua)&&!/Mobile/i.test(ua);
    let minSide=0;
    try{ minSide=Math.min(Number(screen.width||0),Number(screen.height||0)); }catch(_e){}
    return ipad||androidTablet||(touch&&minSide>=600);
  }

  function kioskEnabled(){
    try{ return localStorage.getItem(MODE_KEY)==='1'; }catch(_e){ return false; }
  }
  window.shiftboardKioskEnabled=kioskEnabled;

  function unlocked(){
    try{ return Number(sessionStorage.getItem(UNLOCK_UNTIL)||0)>Date.now(); }catch(_e){ return false; }
  }
  window.shiftboardKioskUnlocked=unlocked;

  function activeTablet(){ return tabletLike()&&kioskEnabled(); }
  function locked(){ return activeTablet()&&!unlocked(); }

  function fireChange(){
    try{ window.dispatchEvent(new Event('shiftboard-kiosk-lock-change')); }catch(_e){}
  }

  function returnHome(){
    try{
      if(typeof state==='object'&&state&&['admin-pin','admin'].includes(state.view)){
        state.view='home';
        if(state.admin){ state.admin.pin=''; state.admin.error=''; }
        if(typeof render==='function') render();
      }
    }catch(_e){}
  }

  function lockNow(){
    try{ sessionStorage.removeItem(UNLOCK_UNTIL); }catch(_e){}
    closeModal();
    apply();
    fireChange();
    returnHome();
  }

  function unlockTemporarily(){
    try{ sessionStorage.setItem(UNLOCK_UNTIL,String(Date.now()+UNLOCK_MS)); }catch(_e){}
    apply();
    fireChange();
  }

  function enableKiosk(){
    try{
      localStorage.setItem(MODE_KEY,'1');
      sessionStorage.removeItem(UNLOCK_UNTIL);
    }catch(_e){}
    closeModal();
    apply();
    fireChange();
    returnHome();
  }

  function disableKiosk(){
    try{
      localStorage.removeItem(MODE_KEY);
      sessionStorage.removeItem(UNLOCK_UNTIL);
    }catch(_e){}
    closeModal();
    apply();
    fireChange();
  }

  function apply(){
    const on=locked();
    document.documentElement.classList.toggle('sb-kiosk-pin-locked',on);
    if(activeTablet()&&unlocked()) showControls(); else removeControls();
  }
  window.shiftboardApplyKioskLock=apply;

  function showControls(){
    if(controls||!document.body) return;
    controls=document.createElement('div');
    controls.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483000;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:94vw;font-family:Inter,system-ui,sans-serif;';
    const lock=document.createElement('button');
    lock.type='button'; lock.textContent='Lock kiosk now';
    lock.style.cssText='background:#151516;color:#f7f7f8;border:1px solid #e2222d;padding:10px 14px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);';
    lock.addEventListener('click',lockNow);
    const off=document.createElement('button');
    off.type='button'; off.textContent='Turn kiosk mode off';
    off.style.cssText='background:#151516;color:#b4b6b8;border:1px solid #555;padding:10px 14px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);';
    off.addEventListener('click',()=>openModal('disable'));
    controls.append(lock,off);
    document.body.appendChild(controls);
  }

  function removeControls(){
    if(controls&&controls.parentNode) controls.parentNode.removeChild(controls);
    controls=null;
  }

  function bytesToBase64(bytes){ let s=''; for(const b of bytes) s+=String.fromCharCode(b); return btoa(s); }

  async function digest(pin,salt){
    if(!window.crypto||!crypto.subtle) throw new Error('Secure PIN storage is not supported on this tablet browser.');
    const data=new TextEncoder().encode(String(salt)+':'+String(pin));
    const hash=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function hasPin(){
    try{ return !!localStorage.getItem(HASH_KEY)&&!!localStorage.getItem(SALT_KEY); }catch(_e){ return false; }
  }

  async function storePin(pin){
    const saltBytes=new Uint8Array(16); crypto.getRandomValues(saltBytes);
    const salt=bytesToBase64(saltBytes);
    const hash=await digest(pin,salt);
    localStorage.setItem(SALT_KEY,salt);
    localStorage.setItem(HASH_KEY,hash);
    localStorage.removeItem(FAIL_COUNT);
    localStorage.removeItem(BLOCK_UNTIL);
  }

  async function checkPin(pin){
    const blocked=Number(localStorage.getItem(BLOCK_UNTIL)||0);
    if(blocked>Date.now()) return {ok:false,blocked:true,seconds:Math.max(1,Math.ceil((blocked-Date.now())/1000))};
    const salt=localStorage.getItem(SALT_KEY)||'';
    const expected=localStorage.getItem(HASH_KEY)||'';
    const actual=await digest(pin,salt);
    if(actual===expected){
      localStorage.removeItem(FAIL_COUNT);
      localStorage.removeItem(BLOCK_UNTIL);
      return {ok:true};
    }
    let failures=Number(localStorage.getItem(FAIL_COUNT)||0)+1;
    if(failures>=5){
      localStorage.setItem(BLOCK_UNTIL,String(Date.now()+2*60*1000));
      localStorage.setItem(FAIL_COUNT,'0');
      return {ok:false,blocked:true,seconds:120};
    }
    localStorage.setItem(FAIL_COUNT,String(failures));
    return {ok:false,blocked:false,remaining:5-failures};
  }

  function closeModal(){ if(modal&&modal.parentNode) modal.parentNode.removeChild(modal); modal=null; }

  function openModal(purpose){
    if(!tabletLike()||modal) return;
    purpose=purpose||(!kioskEnabled()?'enable':'unlock');
    let mode=hasPin()?'verify':'set';
    let firstPin='';
    let entered='';

    modal=document.createElement('div');
    modal.id='sb-kiosk-pin-modal';
    modal.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,sans-serif;';
    modal.innerHTML='<div style="width:340px;max-width:94vw;background:#151516;color:#f7f7f8;border:1px solid #333335;border-top:4px solid #e2222d;padding:22px;box-shadow:0 15px 45px rgba(0,0,0,.55);">'+
      '<div id="sb-kiosk-pin-title" style="font-size:22px;font-weight:700;margin-bottom:7px;"></div>'+
      '<div id="sb-kiosk-pin-sub" style="font-size:13px;color:#b4b6b8;line-height:1.45;margin-bottom:18px;"></div>'+
      '<div id="sb-kiosk-pin-dots" style="display:flex;justify-content:center;gap:12px;margin:12px 0 18px;"></div>'+
      '<div id="sb-kiosk-pin-error" style="min-height:18px;color:#ff5b52;font-size:12px;text-align:center;margin-bottom:8px;"></div>'+
      '<div id="sb-kiosk-pin-pad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>'+
      '<button type="button" id="sb-kiosk-pin-cancel" style="width:100%;margin-top:14px;padding:11px;background:transparent;color:#b4b6b8;border:1px solid #333335;">Cancel</button>'+
      '</div>';
    document.body.appendChild(modal);

    const title=modal.querySelector('#sb-kiosk-pin-title');
    const sub=modal.querySelector('#sb-kiosk-pin-sub');
    const dots=modal.querySelector('#sb-kiosk-pin-dots');
    const error=modal.querySelector('#sb-kiosk-pin-error');
    const pad=modal.querySelector('#sb-kiosk-pin-pad');

    function text(){
      if(mode==='set'){
        title.textContent='Set kiosk PIN';
        sub.textContent='Choose a 4-digit supervisor PIN for this tablet. The PIN itself is not stored.';
      }else if(mode==='confirm'){
        title.textContent='Confirm kiosk PIN';
        sub.textContent='Enter the same 4 digits again.';
      }else if(purpose==='enable'){
        title.textContent='Turn kiosk mode on';
        sub.textContent='Enter the supervisor PIN to lock this tablet to the staff kiosk.';
      }else if(purpose==='disable'){
        title.textContent='Turn kiosk mode off';
        sub.textContent='Enter the supervisor PIN. This tablet will return to normal Shiftboard afterwards.';
      }else{
        title.textContent='Unlock kiosk';
        sub.textContent='Enter the supervisor PIN. Shiftboard will unlock for 10 minutes.';
      }
    }

    function drawDots(){
      dots.innerHTML='';
      for(let i=0;i<4;i++){
        const d=document.createElement('span');
        d.style.cssText='width:15px;height:15px;border-radius:50%;border:2px solid '+(i<entered.length?'#e2222d':'#555')+';background:'+(i<entered.length?'#e2222d':'transparent')+';display:block;';
        dots.appendChild(d);
      }
    }

    function reset(message){ entered=''; error.textContent=message||''; text(); drawDots(); }

    function completePurpose(){
      if(purpose==='enable') enableKiosk();
      else if(purpose==='disable') disableKiosk();
      else { unlockTemporarily(); closeModal(); }
    }

    async function processPin(){
      if(entered.length!==4) return;
      const pin=entered;
      if(mode==='set'){
        firstPin=pin; mode='confirm'; reset(''); return;
      }
      if(mode==='confirm'){
        if(pin!==firstPin){ mode='set'; firstPin=''; reset('PINs did not match. Start again.'); return; }
        try{ await storePin(pin); completePurpose(); }
        catch(err){ mode='set'; reset(err&&err.message?err.message:'Could not save kiosk PIN.'); }
        return;
      }
      try{
        const result=await checkPin(pin);
        if(result.ok){ completePurpose(); return; }
        if(result.blocked){ reset('Too many attempts. Try again in '+result.seconds+' seconds.'); return; }
        reset('Incorrect PIN. '+result.remaining+' attempt'+(result.remaining===1?'':'s')+' remaining.');
      }catch(err){ reset(err&&err.message?err.message:'Could not check kiosk PIN.'); }
    }

    ['1','2','3','4','5','6','7','8','9','clear','0','back'].forEach(key=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=key==='clear'?'Clear':key==='back'?'⌫':key;
      btn.style.cssText='height:58px;background:#1e1e1f;color:#f7f7f8;border:1px solid #333335;font-size:'+(key.length===1?'21px':'13px')+';';
      btn.addEventListener('click',()=>{
        if(key==='clear') entered='';
        else if(key==='back') entered=entered.slice(0,-1);
        else if(entered.length<4) entered+=key;
        error.textContent=''; drawDots();
        if(entered.length===4) setTimeout(processPin,80);
      });
      pad.appendChild(btn);
    });
    modal.querySelector('#sb-kiosk-pin-cancel').addEventListener('click',closeModal);
    text(); drawDots();
  }

  const style=document.createElement('style');
  style.textContent='\n.sb-kiosk-pin-locked [data-action="go-admin-pin"],\n.sb-kiosk-pin-locked [data-action="change-kiosk-site"],\n.sb-kiosk-pin-locked [data-action="go-privacy"],\n.sb-kiosk-pin-locked button[onclick*="installShiftBoard"]{display:none!important;}\n.sb-kiosk-pin-locked .brand-logo{touch-action:none;}\n';
  (document.head||document.documentElement).appendChild(style);

  function startHold(event){
    if(!tabletLike()) return;
    const target=event.target&&event.target.closest?event.target.closest('.brand-logo'):null;
    if(!target) return;
    clearTimeout(holdTimer);
    holdTimer=setTimeout(()=>{
      holdTimer=null;
      if(!kioskEnabled()) openModal('enable');
      else if(!unlocked()) openModal('unlock');
    },1800);
  }
  function cancelHold(){ if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; } }

  document.addEventListener('pointerdown',startHold,true);
  document.addEventListener('pointerup',cancelHold,true);
  document.addEventListener('pointercancel',cancelHold,true);
  document.addEventListener('pointermove',function(event){ if(holdTimer&&event.pointerType==='touch'&&event.pressure===0) cancelHold(); },true);

  document.addEventListener('click',function(event){
    if(!locked()) return;
    const blocked=event.target&&event.target.closest?event.target.closest('[data-action="go-admin-pin"],[data-action="change-kiosk-site"],[data-action="go-privacy"],button[onclick*="installShiftBoard"]'):null;
    if(!blocked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  window.addEventListener('shiftboard-kiosk-lock-change',apply);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') apply(); });
  window.addEventListener('focus',apply);
  setInterval(apply,10000);
  apply();
})();
