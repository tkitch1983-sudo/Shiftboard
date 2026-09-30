(function(){
  'use strict';

  function isLScott(emp){
    return !!emp && String(emp.name||'').trim().toLowerCase()==='l scott';
  }

  // The main holiday form already supports named cover exemptions. Reuse that
  // path for L Scott without changing any other filling-station staff rules.
  if(typeof renderHoliday==='function'){
    const originalRenderHoliday=renderHoliday;
    renderHoliday=function(){
      const emp=state&&state.flow?state.flow.employee:null;
      if(!isLScott(emp)) return originalRenderHoliday.apply(this,arguments);
      const realName=emp.name;
      try{
        emp.name='g marsay';
        return originalRenderHoliday.apply(this,arguments);
      }finally{
        emp.name=realName;
      }
    };
  }

  // The submit handler repeats the same exemption check. Temporarily route
  // L Scott through the existing exempt branch for that click only.
  document.addEventListener('click',function(event){
    const target=event.target&&event.target.closest?event.target.closest('[data-action="submit-holiday"]'):null;
    if(!target) return;
    const emp=state&&state.flow?state.flow.employee:null;
    if(!isLScott(emp)) return;
    const realName=emp.name;
    emp.name='g marsay';
    setTimeout(function(){
      if(emp && emp.name==='g marsay') emp.name=realName;
    },0);
  },true);
})();
