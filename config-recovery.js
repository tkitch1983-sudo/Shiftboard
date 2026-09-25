(function(){
  'use strict';
  const PENDING_KEY='shiftboard_pending_keys_v4';
  const LOCAL_KEY='shiftboard_local_record_v3';
  const ONCE_KEY='shiftboard_config_recovery_20260925';

  try{
    if(sessionStorage.getItem(ONCE_KEY)==='done') return;
    const raw=localStorage.getItem(PENDING_KEY);
    if(!raw){ sessionStorage.setItem(ONCE_KEY,'done'); return; }
    const pending=JSON.parse(raw);
    const cfg=pending && pending.config;
    if(!cfg){ sessionStorage.setItem(ONCE_KEY,'done'); return; }

    const employees=Array.isArray(cfg.employees)?cfg.employees:[];
    const pinCount=employees.filter(function(e){ return e && String(e.pin||'').trim(); }).length;
    const looksIncomplete=employees.length<25 || (employees.length>=25 && pinCount<Math.floor(employees.length*0.5));
    if(!looksIncomplete){ sessionStorage.setItem(ONCE_KEY,'done'); return; }

    delete pending.config;
    if(Object.keys(pending).length) localStorage.setItem(PENDING_KEY,JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(LOCAL_KEY);
    sessionStorage.setItem(ONCE_KEY,'done');
    setTimeout(function(){ location.reload(); },80);
  }catch(_e){
    try{ sessionStorage.setItem(ONCE_KEY,'done'); }catch(__e){}
  }
})();
