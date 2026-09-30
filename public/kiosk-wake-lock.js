(function(){
  'use strict';

  let wakeLock=null;

  function kioskConfigured(){
    try{
      if(typeof getKioskSite==='function') return !!getKioskSite();
      return !!localStorage.getItem('sb_kiosk_site');
    }catch(_e){ return false; }
  }

  function tabletLike(){
    const ua=String(navigator.userAgent||'');
    const touch=Number(navigator.maxTouchPoints||0)>0;
    const ipad=/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints||0)>1);
    const androidTablet=/Android/i.test(ua)&&!/Mobile/i.test(ua);
    let minSide=0;
    try{ minSide=Math.min(Number(screen.width||0),Number(screen.height||0)); }catch(_e){}
    return ipad||androidTablet||(touch&&minSide>=600);
  }

  function shouldHold(){
    return kioskConfigured()&&tabletLike()&&document.visibilityState==='visible';
  }

  async function acquire(){
    if(!shouldHold() || !('wakeLock' in navigator) || wakeLock) return;
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
