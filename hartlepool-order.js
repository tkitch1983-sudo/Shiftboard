(function(){
  'use strict';

  try{
    if(typeof timesheetEmployeeCompare!=='function' || typeof siteName!=='function') return;

    const originalTimesheetEmployeeCompare=timesheetEmployeeCompare;
    const preferredOrder={
      'm riley':0,
      'c hann':1,
      'l brown':2,
      's swainson':3,
      // Keep the current live spelling in the same position if the record is still S Swanson.
      's swanson':3
    };

    timesheetEmployeeCompare=function(siteId,a,b){
      const site=String(siteName(siteId)||'').trim().toLowerCase();
      if(site==='hartlepool'){
        const aName=String(a&&a.name||'').trim().toLowerCase();
        const bName=String(b&&b.name||'').trim().toLowerCase();
        const aRank=Object.prototype.hasOwnProperty.call(preferredOrder,aName)?preferredOrder[aName]:999;
        const bRank=Object.prototype.hasOwnProperty.call(preferredOrder,bName)?preferredOrder[bName]:999;
        if(aRank!==bRank) return aRank-bRank;
        if(aRank<999) return aName.localeCompare(bName);
      }
      return originalTimesheetEmployeeCompare(siteId,a,b);
    };

    if(typeof state!=='undefined' && state.admin && state.admin.authed && state.admin.tab==='timesheets' && typeof render==='function'){
      setTimeout(function(){ try{ render(); }catch(_e){} },0);
    }
  }catch(err){
    console.error('Hartlepool timesheet order fix failed:',err);
  }
})();
