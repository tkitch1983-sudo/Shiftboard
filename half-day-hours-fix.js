(function(){
  'use strict';

  try{
    if(typeof paidHoursForDay!=='function' || typeof clampedHoursForShift!=='function') return;

    const originalPaidHoursForDay=paidHoursForDay;

    // Workshop half-days are paid as the full clocked 4.5 hours. The normal
    // 30-minute unpaid dinner deduction only starts once the day's worked
    // hours exceed 4.5 hours. Existing filling-station and works-through-
    // dinner rules continue to be handled by the original calculation.
    paidHoursForDay=function(dayShifts,dateStr,siteId,emp){
      const shifts=(Array.isArray(dayShifts)?dayShifts:[]).slice().sort((a,b)=>a.inTs-b.inTs);
      let rawHours=0;
      shifts.forEach((shift,index)=>{
        rawHours+=clampedHoursForShift(shift.date,shift.inTs,shift.outTs,siteId,index===0,emp);
      });

      const effectiveSiteId=(emp&&emp.siteId)||siteId;
      const day=typeof fromIso==='function' ? fromIso(dateStr).getDay() : new Date(dateStr+'T12:00:00').getDay();
      const workshopWeekday=day>=1&&day<=5 && !(typeof isFillingStationSite==='function'&&isFillingStationSite(effectiveSiteId));
      const needsHalfDayProtection=workshopWeekday && rawHours>0 && rawHours<=4.5 && !(emp&&emp.noLunchBreak);

      if(needsHalfDayProtection){
        const noDinnerEmp=Object.assign({},emp||{},{noLunchBreak:true});
        return originalPaidHoursForDay.call(this,dayShifts,dateStr,siteId,noDinnerEmp);
      }
      return originalPaidHoursForDay.apply(this,arguments);
    };

    // Keep the on-screen timesheet guidance aligned with the payroll rule.
    if(typeof renderAdminTimesheets==='function'){
      const originalRenderAdminTimesheets=renderAdminTimesheets;
      renderAdminTimesheets=function(){
        const html=originalRenderAdminTimesheets.apply(this,arguments);
        if(typeof html!=='string') return html;
        return html.replace(
          'Workshop weekdays have a 30-min unpaid dinner break.',
          'Workshop weekdays over 4.50 hours have a 30-min unpaid dinner break; a half day of up to 4.50 hours has no dinner deduction.'
        );
      };
    }
  }catch(err){
    console.error('Half-day hours fix failed:',err);
  }
})();
