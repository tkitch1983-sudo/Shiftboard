(function(){
  'use strict';

  const ETAC_PETROL_SITE_ID='mtslj2e8qsrmk2';
  const ETAC_TIMESHEET_EDITORS=new Set([
    'zara@neautoservices.com',
    'gemma@neautoservices.com'
  ]);
  const CONTROL_SELECTOR='[data-hrs-emp],[data-ts-field],[data-abs-emp],[data-ts-note-site]';
  const NOTICE_ID='etac-timesheet-edit-lock';

  function currentEmail(){
    try{return String((typeof _session!=='undefined'&&_session&&_session.email)||'').trim().toLowerCase();}
    catch(_e){return '';}
  }

  function canAmendEtacTimesheet(){
    return ETAC_TIMESHEET_EDITORS.has(currentEmail());
  }

  function employeeSite(employeeId){
    try{
      if(typeof employeeById!=='function') return '';
      const emp=employeeById(employeeId);
      return emp?String(emp.siteId||''):'';
    }catch(_e){return '';}
  }

  function controlSite(el){
    if(!el||!el.dataset) return '';
    if(el.dataset.tsNoteSite) return String(el.dataset.tsNoteSite||'');
    const employeeId=el.dataset.hrsEmp||el.dataset.tsEmp||el.dataset.absEmp||'';
    return employeeId?employeeSite(employeeId):'';
  }

  function isEtacTimesheetControl(el){
    return controlSite(el)===ETAC_PETROL_SITE_ID;
  }

  function selectedTimesheetSite(){
    try{
      if(typeof state==='undefined'||!state||!state.admin) return '';
      return String(state.admin.role==='super'?state.admin.tsSite:state.admin.scopeSite||'');
    }catch(_e){return '';}
  }

  function applyRestriction(){
    const allowed=canAmendEtacTimesheet();
    document.querySelectorAll(CONTROL_SELECTOR).forEach(el=>{
      if(!isEtacTimesheetControl(el)) return;
      if(allowed) return;
      el.disabled=true;
      el.setAttribute('aria-disabled','true');
      el.dataset.etacTimesheetProtected='1';
      el.title='ETAC Petrol timesheets can only be amended by Zara or Gemma.';
    });

    const showingEtac=selectedTimesheetSite()===ETAC_PETROL_SITE_ID;
    let notice=document.getElementById(NOTICE_ID);
    if(showingEtac&&!allowed){
      if(!notice){
        const output=document.getElementById('timesheet-output');
        if(output&&output.parentNode){
          notice=document.createElement('div');
          notice.id=NOTICE_ID;
          notice.className='card';
          notice.style.borderColor='var(--amber)';
          notice.innerHTML='<b>ETAC Petrol timesheet is read-only</b><div style="color:var(--muted);font-size:13px;margin-top:4px;">Only Zara and Gemma can amend hours, absence markers, overtime, holidays, sickness or notes for this site.</div>';
          output.parentNode.insertBefore(notice,output);
        }
      }
    }else if(notice){
      notice.remove();
    }
  }

  function blockProtectedEdit(event){
    const el=event.target&&event.target.closest?event.target.closest(CONTROL_SELECTOR):null;
    if(!el||!isEtacTimesheetControl(el)||canAmendEtacTimesheet()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{if(typeof showToast==='function') showToast('ETAC Petrol timesheets can only be amended by Zara or Gemma.',true);}catch(_e){}
    try{if(typeof render==='function') render();}catch(_e){}
  }

  document.addEventListener('change',blockProtectedEdit,true);
  document.addEventListener('focusin',event=>{
    const el=event.target&&event.target.closest?event.target.closest(CONTROL_SELECTOR):null;
    if(el&&isEtacTimesheetControl(el)&&!canAmendEtacTimesheet()){
      el.disabled=true;
      try{el.blur();}catch(_e){}
    }
  },true);

  const start=()=>{
    applyRestriction();
    const root=document.getElementById('app')||document.body;
    if(!root) return;
    const observer=new MutationObserver(()=>applyRestriction());
    observer.observe(root,{childList:true,subtree:true});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
