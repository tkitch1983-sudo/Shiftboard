/* Read-only clocking attribution summary; never includes staff PIN values. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ShiftboardClockingAuditCore=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const DAY=86400000;
 function text(v){return String(v==null?'':v).trim();}
 function esc(v){return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function ukDay(ts){
  const date=new Date(ts);if(!Number.isFinite(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p=k=>(parts.find(x=>x.type===k)||{}).value||'';
  return p('year')+'-'+p('month')+'-'+p('day');
 }
 function summarize({events=[],employees=[],sites=[],timesheetExtras={}}={},opts={}){
  const nowMs=opts.nowMs===undefined?Date.now():Number(opts.nowMs);
  if(!Number.isFinite(nowMs))throw Error('Valid reference time required');
  const days=Number.isInteger(opts.days)&&opts.days>=1&&opts.days<=31?opts.days:7;
  const minEvents=Number.isInteger(opts.minEvents)&&opts.minEvents>=1?opts.minEvents:3;
  const minDays=Number.isInteger(opts.minDays)&&opts.minDays>=1?opts.minDays:2;
  const fromMs=nowMs-days*DAY;
  const byEmp=new Map((Array.isArray(employees)?employees:[]).filter(e=>e&&e.id).map(e=>[String(e.id),e]));
  const bySite=new Map((Array.isArray(sites)?sites:[]).filter(s=>s&&s.id).map(s=>[String(s.id),s]));
  const counts={events:0,pinPath:0,managerEntered:0,managerEdited:0,hourOverrides:0,staffFlagged:0};
  const byStaff=new Map(),byLocation=new Map();
  for(const e of (Array.isArray(events)?events:[])){
   if(!e||!e.employeeId)continue;
   const ms=Number(e.timestamp);
   if(!Number.isFinite(ms)||ms<fromMs||ms>nowMs)continue;
   const emp=byEmp.get(String(e.employeeId));
   if(!emp)continue;
   const siteId=text(e.siteId||emp.siteId)||'unknown';
   const siteName=text((bySite.get(siteId)||{}).name)||'Unassigned centre';
   const entered=!!text(e.enteredBy),edited=!!text(e.editedBy);
   const id=String(e.employeeId);
   if(!byStaff.has(id))byStaff.set(id,{id,name:text(emp.name)||'Employee',siteId:text(emp.siteId),managerEntered:0,managerEdited:0,pinPath:0,days:new Set(),locations:new Set(),last:0});
   if(!byLocation.has(siteId))byLocation.set(siteId,{siteId,siteName,managerEntered:0,managerEdited:0});
   const row=byStaff.get(id),loc=byLocation.get(siteId);
   counts.events++;
   if(entered){
    counts.managerEntered++;loc.managerEntered++;row.managerEntered++;
    row.days.add(ukDay(ms));row.locations.add(siteName);row.last=Math.max(row.last,ms);
   }else{counts.pinPath++;row.pinPath++;}
   if(edited){counts.managerEdited++;loc.managerEdited++;row.managerEdited++;}
  }
  const fromDay=ukDay(fromMs),toDay=ukDay(nowMs);
  const extra=timesheetExtras&&typeof timesheetExtras==='object'&&!Array.isArray(timesheetExtras)?timesheetExtras:{};
  for(const week of Object.values(extra)){
   for(const [id,person] of Object.entries(week&&week.employees||{})){
    if(!byEmp.has(String(id)))continue;
    for(const [day,hours] of Object.entries(person&&person.hoursOverride||{})){
     if(day>=fromDay&&day<=toDay&&hours!==''&&hours!=null)counts.hourOverrides++;
    }
   }
  }
  const rows=[...byStaff.values()].filter(x=>x.managerEntered).map(x=>({
   employeeId:x.id,name:x.name,homeSiteId:x.siteId,managerEntered:x.managerEntered,managerEdited:x.managerEdited,pinPath:x.pinPath,
   distinctDays:x.days.size,centres:[...x.locations].sort(),lastManagerEntryDate:ukDay(x.last),
   flagged:x.managerEntered>=minEvents&&x.days.size>=minDays
  })).sort((a,b)=>b.managerEntered-a.managerEntered||b.distinctDays-a.distinctDays||a.name.localeCompare(b.name));
  const flagged=rows.filter(x=>x.flagged);
  counts.staffFlagged=flagged.length;
  return {days,fromDay,toDay,minEvents,minDays,counts,rows,flagged,
   sites:[...byLocation.values()].sort((a,b)=>b.managerEntered-a.managerEntered),
   note:'PIN-pathway records do not prove who physically typed the PIN; recorded manager names are not authenticated attribution.'};
 }
 function emailSection(report,limit=5){
  const c=report.counts;
  const rows=report.flagged.slice(0,limit).map(r=>
   '<tr><td style="padding:8px;border-bottom:1px solid #ddd">'+esc(r.name)+'</td>'+
   '<td style="padding:8px;border-bottom:1px solid #ddd">'+r.managerEntered+' events / '+r.distinctDays+' days</td>'+
   '<td style="padding:8px;border-bottom:1px solid #ddd">'+esc(r.centres.join(', '))+'</td></tr>').join('');
  return '<section style="font:14px Arial,sans-serif;color:#202024">'+
   '<h2 style="font-size:18px;color:#b91c2a">Clocking &amp; PIN Audit — '+report.days+' days</h2>'+
   '<p>PIN-pathway entries: <b>'+c.pinPath+'</b> · Manager-entered clocks: <b>'+c.managerEntered+'</b> · Clock time corrections: <b>'+c.managerEdited+'</b> · Timesheet day overrides: <b>'+c.hourOverrides+'</b></p>'+
   '<p><b>'+c.staffFlagged+' staff flagged</b> for '+report.minEvents+'+ manager-entered events on '+report.minDays+'+ separate days.</p>'+
   (rows?'<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Staff</th><th align="left">Manual events</th><th align="left">Centre(s)</th></tr></thead><tbody>'+rows+'</tbody></table>':
    '<p>No repeated manager-entered clocking pattern detected.</p>')+
   (report.flagged.length>limit?'<p>Plus '+(report.flagged.length-limit)+' more staff to review in Shiftboard.</p>':'')+
   '<p style="font-size:12px;color:#666">For named authorised upper-management recipients only. PIN clocking does not prove who physically entered the PIN. Names recorded on manual entries are not independently verified. No PIN values are included.</p></section>';
 }
 return {summarize,emailSection,esc,ukDay};
});