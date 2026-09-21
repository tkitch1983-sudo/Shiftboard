(function(){
  'use strict';

  function clearPhotoState(){
    try{
      if(typeof state!=='undefined' && state && state.admin) state.admin.viewingClockPhoto=null;
    }catch(_e){}
  }

  function removePhotoOverlays(){
    clearPhotoState();
    document.querySelectorAll('.modal-overlay').forEach(function(overlay){
      const txt=String(overlay.textContent||'');
      if(txt.includes('Clock photo') || txt.includes('${emp?') || overlay.querySelector('[data-action="close-clock-photo"]')) overlay.remove();
    });
  }

  document.addEventListener('click',function(e){
    const el=e.target&&e.target.closest?e.target.closest('[data-action="view-clock-photo"]'):null;
    if(!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    clearPhotoState();
    try{ if(typeof showToast==='function') showToast('Clock photo viewer is temporarily disabled.'); }catch(_e){}
    removePhotoOverlays();
  },true);

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape') removePhotoOverlays();
  },true);

  const observer=new MutationObserver(function(){ removePhotoOverlays(); });
  try{ observer.observe(document.documentElement,{childList:true,subtree:true}); }catch(_e){}

  try{ renderClockPhotoModal=function(){ clearPhotoState(); return ''; }; }catch(_e){}
  removePhotoOverlays();
})();
