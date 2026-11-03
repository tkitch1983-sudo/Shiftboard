(() => {
  "use strict";
  let refreshing=false;

  function onRemittancePage(){
    return !!(window.state && state.view==="admin" && state.admin && state.admin.tab==="remittances");
  }

  async function refresh(){
    if(refreshing || !onRemittancePage() || !window.NEASRemittances || typeof window.NEASRemittances.load!=="function") return;
    refreshing=true;
    try{
      await window.NEASRemittances.load();
    }catch(_e){
      // Existing Remittances UI already handles and displays its own errors.
    }finally{
      refreshing=false;
    }
  }

  setInterval(refresh,15000);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible") setTimeout(refresh,250);
  });
  window.addEventListener("focus",()=>setTimeout(refresh,250));
})();