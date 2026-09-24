(function(){
  'use strict';

  try{
    if(typeof renderClock!=='function' || typeof callRpc!=='function') return;

    let saving=false;

    renderClock=function(){
      const emp=state.flow.employee;
      const clockedIn=emp && emp.clockStatus==='in';
      return `${topstrip()}
      <div class="flow"><div class="flow-card">
        <h2>Hi, ${emp.name}</h2>
        <div class="sub">${siteName(emp.siteId)}</div>
        ${clockedIn ? `
          <div style="color:var(--muted);font-size:13px;margin-bottom:14px;">What are you clocking out for?</div>
          <button type="button" class="action-btn secondary" data-action="clock-out-dinner">Clock Out — Dinner</button>
          <button type="button" class="action-btn" data-action="clock-out-end-shift">Clock Out — End Shift</button>
        ` : `
          <button type="button" class="action-btn" data-action="do-clock">Clock In</button>
        `}
        <div style="margin-top:18px;"><span class="admin-link" data-action="start-change-pin">Change my PIN</span></div>
        <div class="back-link" data-action="go-home">← Cancel</div>
      </div></div>`;
    };

    if(typeof renderClockConfirm==='function'){
      renderClockConfirm=function(){
        const last=state.flow.lastAction||{};
        const heading=last.type==='in'
          ? 'Clocked In'
          : last.reason==='dinner'
            ? 'Clocked Out — Dinner'
            : last.reason==='end_shift'
              ? 'Clocked Out — End Shift'
              : 'Clocked Out';
        return `${topstrip()}
        <div class="flow"><div class="flow-card">
          <div class="big-check">✓</div>
          <h2>${heading}</h2>
          <div class="sub">${fmtTime(last.ts)}</div>
          <button type="button" class="action-btn secondary" data-action="go-home">Done</button>
        </div></div>`;
      };
    }

    async function clockOut(reason){
      if(saving) return;
      const emp=state.flow.employee;
      const pin=state.flow.verifiedPin;
      if(!emp || !pin){ showToast('Please enter your PIN again.',true); return; }
      saving=true;
      try{
        const res=await callRpc('staff_clock_v2',{
          p_pin:pin,
          p_site_id:getKioskSite()||emp.siteId,
          p_out_reason:reason
        });
        if(!res){ showToast('PIN not recognised.',true); return; }
        const recordedReason=res.type==='out' ? (res.outReason||reason) : null;
        state.flow.lastAction={type:res.type,ts:Number(res.timestamp),reason:recordedReason};
        if(state.flow.employee) state.flow.employee.clockStatus=res.type==='in'?'in':'out';
        state.view='clock-confirm';
        render();
        if(state.config.settings.clockPhotos && res.id){
          const img=await captureClockPhoto();
          if(img){
            try{ await callRpc('staff_clock_photo',{p_pin:pin,p_event_id:res.id,p_image:img}); }
            catch(_e){}
          }
        }
      }catch(err){
        showToast('Could not record clocking — '+(err && err.message ? err.message : 'connection problem'),true);
      }finally{
        saving=false;
      }
    }

    document.addEventListener('click',function(e){
      const target=e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if(!target) return;
      const action=target.dataset.action;
      if(action!=='clock-out-dinner' && action!=='clock-out-end-shift') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clockOut(action==='clock-out-dinner'?'dinner':'end_shift');
    },true);
  }catch(err){
    console.error('Clock-out option setup failed:',err);
  }
})();
