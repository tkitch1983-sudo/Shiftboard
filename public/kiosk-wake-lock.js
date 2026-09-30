(function(){
  'use strict';

  let wakeLock=null;

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
    try{
      if(typeof window.shiftboardKioskEnabled==='function') return window.shiftboardKioskEnabled();
      return localStorage.getItem('sb_kiosk_mode_enabled_v1')==='1';
    }catch(_e){ return false; }
  }

  function shouldHold(){ return tabletLike()&&kioskEnabled()&&document.visibilityState==='visible'; }

  async function acquire(){
    if(!shouldHold()) { await release(); return; }
    if(!('wakeLock' in navigator)||wakeLock) return;
    try{
      wakeLock=await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release',()=>{ wakeLock=null; });
    }catch(_e){ wakeLock=null; }
  }

  async function release(){
    if(!wakeLock) return;
    try{ await wakeLock.release(); }catch(_e){}
    wakeLock=null;
  }

  window.addEventListener('shiftboard-kiosk-lock-change',acquire);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') acquire(); else release();
  });
  window.addEventListener('focus',acquire);
  window.addEventListener('pageshow',acquire);
  document.addEventListener('click',acquire,{passive:true});
  document.addEventListener('touchstart',acquire,{passive:true});
  setInterval(acquire,30000);
  acquire();
})();
