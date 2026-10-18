/* Upper-management-only clocking review, read-only in Clock Log. */
(function(){
 'use strict';
 try{
  if(typeof renderAdminClockLog!=='function'||!globalThis.ShiftboardClockingAuditCore)return;
  const original=renderAdminClockLog,core=globalThis.ShiftboardClockingAuditCore;
  function data(){
   return core.summarize({
    events:state.events||[],
    employees:state.config&&state.config.employees||[],
    sites:state.config&&state.config.sites||[],
    timesheetExtras:state.timesheetExtras||{}
   });
  }
  function panel(){
   if(!state||!state.admin||state.admin.role!=='super')return '';
   const report=data(),c=report.counts;
   const cards=[
    ['PIN-pathway clocks',c.pinPath],
    ['Manager-entered clocks',c.managerEntered],
    ['Manager time corrections',c.managerEdited],
    ['Staff flagged',c.staffFlagged]
   ].map(([label,n])=>'<div style="padding:10px;background:var(--panel-2);min-width:125px;flex:1">'+
     '<div style="color:var(--muted);font-size:11px">'+core.esc(label)+'</div>'+
     '<b style="font-size:23px">'+n+'</b></div>').join('');
   const flagged=report.flagged.slice(0,12).map(r=>'<tr>'+
    '<td>'+core.esc(r.name)+'</td><td>'+core.esc(r.centres.join(', '))+'</td>'+
    '<td>'+r.managerEntered+'</td><td>'+r.distinctDays+'</td>'+
    '<td>'+core.esc(r.lastManagerEntryDate)+'</td></tr>').join('');
   return '<section class="card" style="border-left:4px solid var(--amber);margin:18px 0 22px">'+
    '<h2 style="font-size:19px;margin-bottom:4px">Manager-entered clocking review</h2>'+
    '<div class="head-sub">Last '+report.days+' days ('+core.esc(report.fromDay)+' to '+core.esc(report.toDay)+') · Upper management only</div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">'+cards+'</div>'+
    '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Timesheet day overrides: <b>'+c.hourOverrides+'</b> · Review flag: '+report.minEvents+'+ manager-entered clock events on '+report.minDays+'+ different days within '+report.days+' days.</div>'+
    (flagged?'<h3 style="font-size:16px;margin:15px 0 9px">Staff repeatedly clocked by managers</h3>'+
    '<div style="overflow:auto"><table><thead><tr><th>Staff</th><th>Centre(s)</th><th>Manual clocks</th><th>Days</th><th>Last occurrence</th></tr></thead><tbody>'+flagged+'</tbody></table></div>':
     '<div style="color:var(--green);font-weight:600;font-size:13px">No repeated manager-entered clocking pattern detected.</div>')+
    (report.flagged.length>12?'<p style="font-size:12px;color:var(--muted)">First 12 shown; '+(report.flagged.length-12)+' additional staff need review.</p>':'')+
    '<p style="font-size:12px;line-height:1.5;color:var(--muted);margin:14px 0 0">PIN-pathway clocks cannot prove who typed the PIN. Manual manager entries use the recorded <code>enteredBy</code> marker, and corrections use <code>editedBy</code>. The recorded manager name is not an independently verified identity. This is a review flag, not a finding of misconduct. No PIN values are displayed.</p>'+
    '</section>';
  }
  renderAdminClockLog=function(){
   const html=original();
   if(!state||!state.admin||state.admin.role!=='super'||typeof html!=='string')return html;
   const marker='<details ';
   return html.includes(marker)?html.replace(marker,panel()+marker):html;
  };
  // Reusable, escaped HTML fragment for the future authorised management mailer.
  // This function does not send email or expose access to site-manager users.
  globalThis.shiftboardManagementClockingEmailSection=function(){
   return state&&state.admin&&state.admin.role==='super'?core.emailSection(data()):'';
  };
 }catch(error){console.error('Clocking audit setup failed',error);}
})();