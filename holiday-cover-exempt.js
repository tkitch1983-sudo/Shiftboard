(function(){
  'use strict';

  function isLScott(emp){
    return !!emp && String(emp.name||'').trim().toLowerCase()==='l scott';
  }

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
