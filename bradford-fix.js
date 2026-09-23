(function(){
  'use strict';

  try{
    if(typeof bradfordStatsForEmployee!=='function' || typeof bradfordWindow!=='function') return;

    // A Bradford spell is one continuous run of sickness, not one database
    // record. Managers can enter a multi-day illness one day at a time, which
    // gives those days different caseIds. Count the dates by continuity of the
    // employee's scheduled workdays instead, so three consecutive sick days
    // are one spell. A new spell starts only when there is a scheduled workday
    // between two sick dates that was not recorded as sick.
    bradfordStatsForEmployee=function(emp,asOfIso){
      const win=bradfordWindow(asOfIso);
      const rows=(state.absences||[])
        .filter(function(a){
          return a && a.type==='sick' && a.employeeId===emp.id && a.date>=win.startIso && a.date<=win.endIso;
        })
        .sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });

      const dates=[...new Set(rows.map(function(a){ return a.date; }))].sort();
      const days=dates.length;
      let spells=0;
      let prev=null;

      dates.forEach(function(ds){
        if(!prev || hasScheduledWorkdayBetween(emp,prev,ds)) spells++;
        prev=ds;
      });

      return {
        employee:emp,
        spells:spells,
        days:days,
        score:spells*spells*days,
        lastDate:dates.length?dates[dates.length-1]:null,
        startIso:win.startIso,
        endIso:win.endIso
      };
    };

    if(typeof state!=='undefined' && state.admin && state.admin.authed && state.admin.tab==='bradford' && typeof render==='function'){
      setTimeout(function(){ try{ render(); }catch(_e){} },0);
    }
  }catch(err){
    console.error('Bradford spell grouping fix failed:',err);
  }
})();
