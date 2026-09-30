(function(){
  'use strict';

  let taps=0;
  let tapTimer=null;
  let locationOverlay=null;
  let logoShield=null;
  let edgeGuard=null;

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
      if(typeof window.shiftboardKioskEnabled==='function') return !!window.shiftboardKioskEnabled();
      return localStorage.getItem('sb_kiosk_mode_enabled_v1')==='1';
    }catch(_e){ return false; }
  }

  function supervisorUnlocked(){
    try{ return typeof window.shiftboardKioskUnlocked==='function'&&window.shiftboardKioskUnlocked(); }
    catch(_e){ return false; }
  }

  function locked(){ return tabletLike()&&kioskEnabled()&&!supervisorUnlocked(); }
  function logo(){ return document.querySelector('.brand-logo'); }

  function locationLine(){
    if(!document.body) return null;
    const matches=[];
    Array.from(document.body.querySelectorAll('*')).forEach(function(el){
      const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
      if(text.indexOf('Clocking location:')<0) return;
      const r=el.getBoundingClientRect();
      if(r.width<20||r.height<8||r.bottom<0||r.top>window.innerHeight) return;
      matches.push({el:el,area:r.width*r.height});
    });
    matches.sort(function(a,b){return a.area-b.area;});
    return matches.length?matches[0].el:null;
  }

  function triggerExistingUnlock(){
    const el=logo();
    if(!el) return;
    try{
      const down=typeof PointerEvent==='function'
        ? new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true})
        : new Event('pointerdown',{bubbles:true,cancelable:true});
      el.dispatchEvent(down);
      window.setTimeout(function(){
        try{
          const up=typeof PointerEvent==='function'
            ? new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true})
            : new Event('pointerup',{bubbles:true,cancelable:true});
          el.dispatchEvent(up);
        }catch(_e){}
      },1950);
    }catch(_e){}
  }

  function registerTap(event){
    if(event){event.preventDefault();event.stopImmediatePropagation();}
    taps++;
    clearTimeout(tapTimer);
    tapTimer=setTimeout(function(){taps=0;},2600);
    if(taps>=5){
      taps=0;
      clearTimeout(tapTimer);
      triggerExistingUnlock();
    }
  }

  function swallow(event){
    if(!locked()) return;
    try{event.preventDefault();event.stopImmediatePropagation();}catch(_e){}
    return false;
  }

  function makeInvisibleButton(){
    const el=document.createElement('button');
    el.type='button';
    el.tabIndex=-1;
    el.setAttribute('aria-hidden','true');
    el.style.cssText='position:fixed;opacity:0;background:transparent;border:0;padding:0;margin:0;-webkit-tap-highlight-color:transparent;';
    return el;
  }

  function ensureLocationOverlay(){
    const target=locationLine();
    if(!locked()||!document.body||!target){
      if(locationOverlay&&locationOverlay.parentNode) locationOverlay.parentNode.removeChild(locationOverlay);
      locationOverlay=null;
      return;
    }
    if(!locationOverlay){
      locationOverlay=makeInvisibleButton();
      locationOverlay.style.zIndex='2147482800';
      locationOverlay.style.touchAction='manipulation';
      locationOverlay.addEventListener('click',registerTap,true);
      locationOverlay.addEventListener('contextmenu',swallow,true);
      document.body.appendChild(locationOverlay);
    }
    const r=target.getBoundingClientRect();
    locationOverlay.style.left=Math.max(0,r.left-12)+'px';
    locationOverlay.style.top=Math.max(0,r.top-10)+'px';
    locationOverlay.style.width=Math.max(180,Math.min(window.innerWidth-r.left+12,r.width+24))+'px';
    locationOverlay.style.height=Math.max(44,r.height+20)+'px';
  }

  function ensureLogoShield(){
    const target=logo();
    if(!locked()||!document.body||!target){
      if(logoShield&&logoShield.parentNode) logoShield.parentNode.removeChild(logoShield);
      logoShield=null;
      return;
    }
    if(!logoShield){
      logoShield=makeInvisibleButton();
      logoShield.style.zIndex='2147482750';
      logoShield.style.touchAction='none';
      ['pointerdown','pointerup','click','contextmenu','touchstart','touchmove','touchend'].forEach(function(type){
        logoShield.addEventListener(type,swallow,{capture:true,passive:false});
      });
      document.body.appendChild(logoShield);
    }
    const r=target.getBoundingClientRect();
    logoShield.style.left=Math.max(0,r.left-10)+'px';
    logoShield.style.top=Math.max(0,r.top-10)+'px';
    logoShield.style.width=Math.max(80,r.width+20)+'px';
    logoShield.style.height=Math.max(56,r.height+20)+'px';
  }

  function ensureEdgeGuard(){
    if(!locked()||!document.body){
      if(edgeGuard&&edgeGuard.parentNode) edgeGuard.parentNode.removeChild(edgeGuard);
      edgeGuard=null;
      return;
    }
    if(!edgeGuard){
      edgeGuard=document.createElement('div');
      edgeGuard.setAttribute('aria-hidden','true');
      edgeGuard.style.cssText='position:fixed;left:0;top:0;bottom:0;width:64px;z-index:2147482900;background:transparent;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;';
      ['pointerdown','pointermove','pointerup','pointercancel','click','contextmenu','touchstart','touchmove','touchend'].forEach(function(type){
        edgeGuard.addEventListener(type,swallow,{capture:true,passive:false});
      });
      document.body.appendChild(edgeGuard);
    }
  }

  function sync(){
    if(!tabletLike()) return;
    ensureEdgeGuard();
    ensureLogoShield();
    ensureLocationOverlay();
  }

  window.addEventListener('shiftboard-kiosk-lock-change',function(){setTimeout(sync,40);});
  window.addEventListener('resize',sync);
  window.addEventListener('orientationchange',function(){setTimeout(sync,200);});
  window.addEventListener('focus',function(){setTimeout(sync,60);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(sync,100);});
  const observer=new MutationObserver(function(){setTimeout(sync,50);});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(sync,2000);
  setTimeout(sync,250);
})();
