(function(){
  'use strict';

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function photoSrc(value){
    let v=value;
    if(v&&typeof v==='object') v=v.image||v.data||v.url||v.src||'';
    if(typeof v!=='string') return '';
    v=v.trim();
    if(!v) return '';
    if(/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(v)) return v;
    if(/^(?:https?:|blob:)/i.test(v)) return v;
    if(/^\/9j\//.test(v)) return 'data:image/jpeg;base64,'+v;
    if(/^iVBOR/.test(v)) return 'data:image/png;base64,'+v;
    if(/^UklGR/.test(v)) return 'data:image/webp;base64,'+v;
    if(/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length>200) return 'data:image/jpeg;base64,'+v.replace(/\s+/g,'');
    return '';
  }

  function formatEventTime(ts){
    try{
      if(typeof fmtTime==='function') return fmtTime(ts);
      const d=new Date(ts);
      return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    }catch(_e){ return ''; }
  }

  function install(){
    if(typeof state==='undefined') return;
    window.renderClockPhotoModal=function(){
      try{
        const admin=state.admin||{};
        const eventId=admin.viewingClockPhoto;
        if(!eventId || !admin.clockPhotos) return '';
        const stored=admin.clockPhotos[eventId];
        if(!stored) return '';

        const events=Array.isArray(state.events)?state.events:[];
        const ev=events.find(function(x){return x&&String(x.id)===String(eventId);})||null;
        let emp=null;
        try{ if(ev&&typeof employeeById==='function') emp=employeeById(ev.employeeId); }catch(_e){}
        const evSite=ev?(ev.siteId||(emp?emp.siteId:null)):null;
        let site='';
        try{ if(evSite&&typeof siteName==='function') site=siteName(evSite)||''; }catch(_e){}
        const when=ev?formatEventTime(ev.timestamp):'';
        const meta=[emp&&emp.name?emp.name:'Employee',site,when].filter(Boolean).join(' · ');
        const src=photoSrc(stored);
        const isSuper=admin.role==='super';

        let media='';
        if(src){
          media='<img src="'+esc(src)+'" alt="Clock photo" style="display:block;max-width:100%;max-height:70vh;margin:0 auto;border-radius:4px;border:1px solid var(--line);object-fit:contain;" onerror="this.style.display=\'none\';var n=this.nextElementSibling;if(n)n.style.display=\'block\';">'
            +'<div style="display:none;padding:24px;text-align:center;border:1px solid var(--line);border-radius:4px;color:var(--muted);">This photo could not be displayed. The clock record is still intact.</div>';
        }else{
          media='<div style="padding:24px;text-align:center;border:1px solid var(--line);border-radius:4px;color:var(--muted);">This photo is no longer in a displayable format. The clock record is still intact.</div>';
        }

        let actions='';
        if(isSuper){
          actions+='<button type="button" class="action-btn danger" data-action="delete-clock-photo" data-id="'+esc(eventId)+'" style="width:auto;margin:0;">Delete photo</button>';
        }
        actions+='<button type="button" class="action-btn secondary" data-action="close-clock-photo" style="width:auto;margin:0;">Close</button>';

        return '<div class="modal-overlay" data-modal-overlay="1"><div class="modal" style="width:min(760px,96vw);">'
          +'<h3>Clock photo</h3>'
          +'<div style="color:var(--muted);font-size:13px;margin-bottom:12px;">'+esc(meta)+'</div>'
          +media
          +'<div class="modal-actions" style="justify-content:flex-end;">'+actions+'</div>'
          +'</div></div>';
      }catch(err){
        console.error('Clock photo modal failed:',err);
        return '<div class="modal-overlay" data-modal-overlay="1"><div class="modal" style="width:min(620px,96vw);"><h3>Clock photo</h3><div style="color:var(--muted);margin:12px 0;">The photo viewer could not open this image. The clock record has not been changed.</div><div class="modal-actions" style="justify-content:flex-end;"><button type="button" class="action-btn secondary" data-action="close-clock-photo" style="width:auto;margin:0;">Close</button></div></div></div>';
      }
    };
    window.SHIFTBOARD_CLOCK_PHOTO_MODAL_FIX=2;
  }

  install();
  setTimeout(install,0);
  window.addEventListener('load',install);
})();