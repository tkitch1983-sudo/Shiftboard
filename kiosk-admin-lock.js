(function(){
  'use strict';

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

  function supervisorUnlocked(){
    try{return typeof window.shiftboardKioskUnlocked==='function'&&window.shiftboardKioskUnlocked();}catch(_e){return false;}
  }

  function locked(){ return tabletLike()&&kioskEnabled()&&!supervisorUnlocked(); }

  function apply(){
    const on=locked();
    document.documentElement.classList.toggle('sb-kiosk-tablet-lock',on);
    if(!on) return;
    try{
      if(typeof state==='object'&&state&&['admin-pin','admin'].includes(state.view)){
        state.view='home';
        if(state.admin){ state.admin.pin=''; state.admin.error=''; }
        if(typeof render==='function') render();
      }
    }catch(_e){}
  }

  const style=document.createElement('style');
  style.textContent='.sb-kiosk-tablet-lock [data-action="go-admin-pin"]{display:none!important;}';
  (document.head||document.documentElement).appendChild(style);

  document.addEventListener('click',function(event){
    if(!locked()) return;
    const target=event.target&&event.target.closest?event.target.closest('[data-action="go-admin-pin"]'):null;
    if(!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    apply();
  },true);

  window.addEventListener('shiftboard-kiosk-lock-change',apply);
  window.addEventListener('resize',apply);
  window.addEventListener('orientationchange',apply);
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') apply(); });
  setInterval(apply,10000);
  apply();
})();
