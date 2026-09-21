(function(){
  'use strict';

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function clearOtherModals(){
    try{
      if(typeof state==='undefined' || !state || !state.admin) return;
      state.admin.pendingApprove=null;
      state.admin.editingEmployee=null;
      state.admin.editingSiteManager=null;
      state.admin.editingAdmin=null;
      state.admin.calendarAddDate=null;
      state.admin.calendarDayDetail=null;
      state.admin.vaultEditingId=null;
    }catch(_e){}
  }

  document.addEventListener('click',function(e){
    const el=e.target&&e.target.closest?e.target.closest('[data-action="view-clock-photo"]'):null;
    if(el) clearOtherModals();
  },true);

  try{
    renderClockPhotoModal=function(){
      const eventId=state&&state.admin?state.admin.viewingClockPhoto:null;
      const photos=state&&state.admin?state.admin.clockPhotos:null;
      if(!eventId || !photos || !photos[eventId]) return '';

      const ev=(state.events||[]).find(function(x){ return x&&String(x.id)===String(eventId); })||null;
      const emp=ev&&typeof employeeById==='function'?employeeById(ev.employeeId):null;
      const evSite=ev?(ev.siteId||(emp?emp.siteId:null)):null;
      const isSuper=state.admin.role==='super';
      const src=String(photos[eventId]||'');
      const validImage=/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(src) || /^blob:/i.test(src) || /^https:\/\//i.test(src);
      const meta=(emp?esc(emp.name):'Employee')+(ev?' · '+esc(typeof siteName==='function'?siteName(evSite):'')+' · '+esc(typeof fmtTime==='function'?fmtTime(ev.timestamp):''):'');
      const imageHtml=validImage
        ? '<img src="'+esc(src)+'" alt="clock-in photo" style="display:block;max-width:100%;max-height:70vh;margin:0 auto;border-radius:4px;border:1px solid var(--line);">'
        : '<div class="conflict-box" style="margin:12px 0;">Photo data is unavailable or invalid.</div>';

      return '<div class="modal-overlay" data-modal-overlay="1"><div class="modal" style="width:min(760px,96vw);">'
        +'<h3>Clock photo</h3>'
        +'<div style="color:var(--muted);font-size:13px;margin-bottom:12px;">'+meta+'</div>'
        +imageHtml
        +'<div class="modal-actions" style="justify-content:flex-end;">'
        +(isSuper?'<button type="button" class="action-btn danger" data-action="delete-clock-photo" data-id="'+esc(eventId)+'" style="width:auto;margin:0;">Delete photo</button>':'')
        +'<button type="button" class="action-btn secondary" data-action="close-clock-photo" style="width:auto;margin:0;">Close</button>'
        +'</div></div></div>';
    };
  }catch(_e){}
})();
