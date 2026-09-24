(function(){
  'use strict';

  try{
    if(typeof renderClock!=='function' || typeof callRpc!=='function') return;

    const PAID_TRAVEL_EMPLOYEE_IDS=new Set(['mtshqqxvczz4bu']); // M Langlands / Floaters (Matty)
    let saving=false;

    function isPaidTravelEmployee(emp){
      return !!(emp && PAID_TRAVEL_EMPLOYEE_IDS.has(String(emp.id||'')));
    }

    // Travel is recorded as an OUT at the first site and a normal IN at the
    // destination. For Matty only, the gap between those two same-day events
    // is then included as paid time on the timesheet. If he never clocks in at
    // the destination, no extra travel time is invented automatically.
    if(typeof computeAllShifts==='function'){
      computeAllShifts=function(){
        const byEmp={};
        (state.events||[]).forEach(ev=>{ (byEmp[ev.employeeId]=byEmp[ev.employeeId]||[]).push(ev); });
        const map={};
        const todayStr=iso(new Date());

        Object.keys(byEmp).forEach(empId=>{
          const evs=byEmp[empId].slice().sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
          const shifts=[];
          let pendingIn=null, pendingSite=null, pendingEnteredBy=null;
          let pendingTravelShift=null;
          const emp=employeeById(empId);
          const paidTravel=isPaidTravelEmployee(emp);

          evs.forEach(ev=>{
            const ts=Number(ev.timestamp);
            if(!Number.isFinite(ts)) return;

            if(ev.type==='in'){
              if(pendingTravelShift){
                const travelDate=iso(new Date(pendingTravelShift.travelOutTs));
                const arrivalDate=iso(new Date(ts));
                if(paidTravel && travelDate===arrivalDate && ts>=pendingTravelShift.travelOutTs){
                  pendingTravelShift.outTs=ts;
                  pendingTravelShift.travelPaid=true;
                  pendingTravelShift.travelToSiteId=ev.siteId||null;
                }
                shifts.push(pendingTravelShift);
                pendingTravelShift=null;
              }

              pendingEnteredBy=ev.enteredBy||ev.editedBy||null;
              if(pendingIn!==null){
                const openDate=iso(new Date(pendingIn));
                shifts.push(autoClosedShift(openDate,pendingIn,pendingSite,emp));
              }
              pendingIn=ts;
              pendingSite=ev.siteId||null;
            }
            else if(ev.type==='out' && pendingIn!==null){
              const shift={
                date:iso(new Date(pendingIn)),
                inTs:pendingIn,
                outTs:ts,
                siteId:pendingSite,
                managerEntered:!!(pendingEnteredBy||ev.enteredBy||ev.editedBy),
                outReason:ev.outReason||null
              };

              if(paidTravel && ev.outReason==='travel'){
                shift.travelOutTs=ts;
                pendingTravelShift=shift;
              }else{
                if(pendingTravelShift){ shifts.push(pendingTravelShift); pendingTravelShift=null; }
                shifts.push(shift);
              }
              pendingIn=null;
              pendingSite=null;
              pendingEnteredBy=null;
            }
          });

          if(pendingTravelShift){
            // No destination clock-in found: pay only to the travel clock-out.
            shifts.push(pendingTravelShift);
          }

          let openShift=null;
          if(pendingIn!==null){
            const openDate=iso(new Date(pendingIn));
            if(openDate===todayStr && Date.now()<automaticClockOutTime(openDate,pendingSite,emp)){
              openShift={date:openDate,inTs:pendingIn,siteId:pendingSite};
            }else{
              shifts.push(autoClosedShift(openDate,pendingIn,pendingSite,emp));
            }
          }
          map[empId]={shifts,openShift};
        });
        return map;
      };
    }

    renderClock=function(){
      const emp=state.flow.employee;
      const clockedIn=emp && emp.clockStatus==='in';
      const paidTravel=isPaidTravelEmployee(emp);
      return `${topstrip()}
      <div class="flow"><div class="flow-card">
        <h2>Hi, ${emp.name}</h2>
        <div class="sub">${siteName(emp.siteId)}</div>
        ${clockedIn ? `
          <div style="color:var(--muted);font-size:13px;margin-bottom:14px;">What are you clocking out for?</div>
          <button type="button" class="action-btn secondary" data-action="clock-out-dinner">Clock Out — Dinner</button>
          ${paidTravel?`<button type="button" class="action-btn secondary" data-action="clock-out-travel">Clock Out — Travel to Next Site</button>`:''}
          <button type="button" class="action-btn" data-action="clock-out-end-shift">Clock Out — End Shift</button>
          ${paidTravel?`<div style="color:var(--muted-2);font-size:12px;margin-top:10px;line-height:1.45;">For site-to-site travel, choose Travel to Next Site, then clock in normally when you arrive. That travel gap stays paid.</div>`:''}
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
            : last.reason==='travel'
              ? 'Travelling to Next Site'
              : last.reason==='end_shift'
                ? 'Clocked Out — End Shift'
                : 'Clocked Out';
        const extra=last.reason==='travel'
          ? '<div style="color:var(--muted);font-size:13px;margin-top:-14px;margin-bottom:18px;">Clock in when you arrive at the next site. Travel time will remain paid.</div>'
          : '';
        return `${topstrip()}
        <div class="flow"><div class="flow-card">
          <div class="big-check">✓</div>
          <h2>${heading}</h2>
          <div class="sub">${fmtTime(last.ts)}</div>
          ${extra}
          <button type="button" class="action-btn secondary" data-action="go-home">Done</button>
        </div></div>`;
      };
    }

    async function clockOut(reason){
      if(saving) return;
      const emp=state.flow.employee;
      const pin=state.flow.verifiedPin;
      if(!emp || !pin){ showToast('Please enter your PIN again.',true); return; }
      if(reason==='travel' && !isPaidTravelEmployee(emp)){ showToast('Paid travel is not enabled for this employee.',true); return; }
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
      if(action!=='clock-out-dinner' && action!=='clock-out-end-shift' && action!=='clock-out-travel') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const reason=action==='clock-out-dinner'?'dinner':action==='clock-out-travel'?'travel':'end_shift';
      clockOut(reason);
    },true);
  }catch(err){
    console.error('Clock-out option setup failed:',err);
  }
})();
