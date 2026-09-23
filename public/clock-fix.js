(function(){
  'use strict';

  try{
    // Workshop clocking rules:
    // - scheduled finish stays the real automatic close time (normally 17:30)
    // - staff get 30 minutes after that to record a genuine late clock-out
    // - a forgotten/open shift is displayed as stale after the grace window
    // - auto-closed shifts are still closed at the scheduled finish, so the
    //   grace window never creates extra paid time by itself
    // Filling stations retain their own saved closing-time behaviour.

    function scheduledFinishTime(dateStr, siteId, emp){
      const d = (typeof fromIso==='function') ? fromIso(dateStr) : new Date(String(dateStr)+'T00:00:00');
      const effectiveSiteId = siteId || (emp && emp.siteId) || null;
      let finish = '17:30';

      if(typeof siteHours==='function' && effectiveSiteId){
        const h = siteHours(effectiveSiteId) || {};
        if(d.getDay()===0) finish = h.sundayEnd || '20:00';
        else if(d.getDay()===6) finish = h.saturdayEnd || '13:00';
        else finish = h.weekdayEnd || '17:30';
      }

      const parts = String(finish || '17:30').split(':').map(Number);
      const hour = Number.isFinite(parts[0]) ? parts[0] : 17;
      const minute = Number.isFinite(parts[1]) ? parts[1] : 30;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0).getTime();
    }

    automaticClockOutTime = function(dateStr, siteId, emp){
      const effectiveSiteId = siteId || (emp && emp.siteId) || null;
      const finishTs = scheduledFinishTime(dateStr, effectiveSiteId, emp);
      const fillingStation = typeof isFillingStationSite==='function' && isFillingStationSite(effectiveSiteId);
      return finishTs + (fillingStation ? 0 : 30 * 60 * 1000);
    };

    autoClosedShift = function(dateStr, inTs, siteId, emp){
      let outTs = scheduledFinishTime(dateStr, siteId, emp);
      if(outTs < inTs) outTs = inTs;
      return { date: dateStr, inTs: inTs, outTs: outTs, siteId: siteId, autoClosed: true };
    };

    // Expose the active policy for diagnostics without affecting payroll code.
    window.SHIFTBOARD_CLOCK_RULES = {
      workshopGraceMinutes: 30,
      forgottenShiftClosesAtScheduledFinish: true,
      workshopWeekdayFinishFallback: '17:30',
      payrollDailyCapHours: 8.5
    };

    if(typeof state!=='undefined' && state.admin && state.admin.authed && typeof render==='function'){
      setTimeout(function(){ try{ render(); }catch(_e){} },0);
    }
  }catch(err){
    console.error('Clock grace/auto-close fix failed:', err);
  }
})();
