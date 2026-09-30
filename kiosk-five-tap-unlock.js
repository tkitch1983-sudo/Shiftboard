(function(){
  'use strict';

  let taps=0;
  let tapTimer=null;
  let overlay=null;

  function tabletLike(){
    const ua=String(navigator.userAgent||'');
    const touch=Number(navigator.maxTouchPoints||0)>0;
    const ipad=/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints||0)>1);
    const androidTablet=/Android/i.test(ua)&&!/Mobile/i.test(ua);
    let minSide=0;
    try{ minSide=Math.min(Number(screen.width||0),Number(screen.height||0)); }catch(_e){}
    return ipad||androidTablet||(touch&&minSide>=600);
  }

  function logo(){ return document.querySelector('.brand-logo'); }

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
    if(event){event.preventDefault();event.stopPropagation();}
    taps++;
    clearTimeout(tapTimer);
    tapTimer=setTimeout(function(){taps=0;},2600);
    if(taps>=5){
      taps=0;
      clearTimeout(tapTimer);
      triggerExistingUnlock();
    }
  }

  function positionOverlay(){
    if(!overlay||!logo()) return;
    const r=logo().getBoundingClientRect();
    overlay.style.left=Math.max(0,r.left-10)+'px';
    overlay.style.top=Math.max(0,r.top-10)+'px';
    overlay.style.width=Math.max(80,r.width+20)+'px';
    overlay.style.height=Math.max(60,r.height+20)+'px';
  }

  function ensureOverlay(){
    if(!tabletLike()||!document.body||!logo()) return;
    if(!overlay){
      overlay=document.createElement('button');
      overlay.type='button';
      overlay.setAttribute('aria-label','');
      overlay.tabIndex=-1;
      overlay.style.cssText='position:fixed;z-index:2147482000;opacity:0;background:transparent;border:0;padding:0;margin:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
      overlay.addEventListener('click',registerTap,true);
      overlay.addEventListener('contextmenu',function(e){e.preventDefault();},true);
      document.body.appendChild(overlay);
    }
    positionOverlay();
  }

  window.addEventListener('resize',positionOverlay);
  window.addEventListener('orientationchange',function(){setTimeout(positionOverlay,200);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(ensureOverlay,100);});
  const observer=new MutationObserver(function(){setTimeout(ensureOverlay,50);});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(ensureOverlay,5000);
  setTimeout(ensureOverlay,250);
})();
