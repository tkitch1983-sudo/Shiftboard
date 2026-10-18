/* Shiftboard clocking audit — read-only, management-only UI and email summary helper.
   A manager-entered clock has enteredBy; a corrected clock has editedBy.
   An event without these flags is NOT proof that the employee entered their own PIN.
   No PIN, photo, wage or timesheet value is included. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(!root)return;
  root.NEASClockingAudit=api;

  // Extend the existing clock log, without modifying its staff/site access rules.
  if(typeof root.renderAdminClockLog==='function'){
    const original=root.renderAdminClockLog;
    root.renderAdminClockLog=function(){
      const existing=original.apply(this,arguments);
      const s=typeof state!=='undefined'?state:null;
      if(!s||!s.admin||s.admin.role!=='super')return existing;
      return api.renderManagementPanel(s)+existing;
    };
  }
  // Tony-only compact overview. Full names remain behind the upper-management clock log.
  if(typeof root.renderTonyDashboard==='function'){
    const original=root.renderTonyDashboard;
    root.renderTonyDashboard=function(){
      const existing=original.apply(this,arguments);
      const s=typeof state!=='undefined'?state:null;
      if(!s||!s.admin||s.admin.role!=='super')return existing;
      return api.renderTonySummary(s)+existing;
    };
  }
})(typeof window==='object'?window:null,function(){
  'use strict';
  const DAY_MS=86400000;
  const WINDOW_MS=7*DAY_MS;
  const MIN_EVENTS=3;
  const MIN_DAYS=2;
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
  }
  function ukDay(ts){
    const d=new Date(ts);
    if(!Number.isFinite(d.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(d);
    const vals=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return vals.year+'-'+vals.month+'-'+vals.day;
  }
  function audit(events,employees,sites,nowMs){
    const now=nowMs==null?Date.now():Number(nowMs);
    if(!Number.isFinite(now))throw Error('Invalid audit time');
    const after=now-WINDOW_MS;
    const employeeMap=new Map((Array.isArray(employees)?employees:[]).filter(e=>e&&e.id&&e.active!==false).map(e=>[String(e.id),e]));
    const siteMap=new Map((Array.isArray(sites)?sites:[]).filter(s=>s&&s.id).map(s=>[String(s.id),s.name||s.id]));
    const perStaff=new Map(),perSite=new Map(),perManager=new Map(),seen=new Set();
    let total=0,managerEntered=0,managerEdited=0,unmarked=0;
    for(const ev of Array.isArray(events)?events:[]){
      if(!ev||(!ev.id&&!ev.employeeId)||!['in','out'].includes(ev.type))continue;
      const ts=Number(ev.timestamp);
      if(!Number.isFinite(ts)||ts<=after||ts>now)continue;
      const id=String(ev.id||'');
      if(id){if(seen.has(id))continue;seen.add(id);}
      const emp=employeeMap.get(String(ev.employeeId));
      if(!emp)continue;
      const staffId=String(emp.id);
      const actualSite=String(ev.siteId||emp.siteId||'');
      const homeSite=String(emp.siteId||actualSite);
      const site=perSite.get(actualSite)||{siteId:actualSite,name:String(siteMap.get(actualSite)||'Unknown centre'),events:0,managerEntered:0,managerEdited:0};
      site.events++;
      perSite.set(actualSite,site);
      let staff=perStaff.get(staffId);
      if(!staff){
        staff={employeeId:staffId,name:String(emp.name||'Unnamed employee'),siteId:homeSite,siteName:String(siteMap.get(homeSite)||'Unknown centre'),managerEntered:0,managerEdited:0,managerDays:new Set(),managers:new Set()};
        perStaff.set(staffId,staff);
      }
      total++;
      // A saved "enteredBy" means a manager manually created an in/out event.
      const entryBy=typeof ev.enteredBy==='string'?ev.enteredBy.trim():'';
      const editBy=typeof ev.editedBy==='string'?ev.editedBy.trim():'';
      if(entryBy){
        managerEntered++;site.managerEntered++;staff.managerEntered++;
        staff.managerDays.add(ukDay(ts));staff.managers.add(entryBy);
        const key=entryBy;
        perManager.set(key,(perManager.get(key)||0)+1);
      }
      if(editBy){managerEdited++;site.managerEdited++;staff.managerEdited++;}
      if(!entryBy&&!editBy)unmarked++;
    }
    const flagged=[...perStaff.values()].filter(s=>s.managerEntered>=MIN_EVENTS&&s.managerDays.size>=MIN_DAYS)
      .map(s=>({employeeId:s.employeeId,name:s.name,siteId:s.siteId,siteName:s.siteName,managerEntered:s.managerEntered,days:s.managerDays.size,managerNames:[...s.managers].sort()}))
      .sort((a,b)=>b.managerEntered-a.managerEntered||a.name.localeCompare(b.name));
    const bySite=[...perSite.values()].filter(s=>s.siteId)
      .map(s=>({...s,flaggedStaff:flagged.filter(f=>f.siteId===s.siteId).length}))
      .sort((a,b)=>b.managerEntered-a.managerEntered||a.name.localeCompare(b.name));
    const byManager=[...perManager].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    return {from:after,to:now,windowDays:7,thresholdEvents:MIN_EVENTS,thresholdDays:MIN_DAYS,totalEvents:total,managerEntered,managerEdited,unmarkedEvents:unmarked,flagged,bySite,byManager};
  }
  function reportFromState(s,nowMs){
    return audit(s?.events,s?.config?.employees,s?.config?.sites,nowMs);
  }
  // Safe for a restricted HTML management report: only counts, never staff names or PINs.
  function emailSummaryHtml(r){
    if(!r)return '';
    const rows=r.bySite.filter(s=>s.managerEntered||s.managerEdited||s.flaggedStaff)
      .map(s=>'<tr><td style="padding:7px 10px;border-bottom:1px solid #ddd">'+esc(s.name)+'</td><td style="padding:7px 10px;border-bottom:1px solid #ddd;text-align:right">'+s.managerEntered+'</td><td style="padding:7px 10px;border-bottom:1px solid #ddd;text-align:right">'+s.flaggedStaff+'</td></tr>').join('');
    return '<section aria-label="Manager clocking audit"><h2>Clocking and PIN-control review · last 7 days</h2>'
      +'<p><b>'+r.managerEntered+'</b> manager-entered clock events; <b>'+r.managerEdited+'</b> corrected clock times; <b>'+r.flagged.length+'</b> staff meet the repeated-manager-clocking review threshold.</p>'
      +'<p>Threshold: 3 or more manager-entered in/out events across at least 2 separate days. A review flag is not proof of misuse.</p>'
      +(rows?'<table><thead><tr><th>Centre</th><th>Manager-entered events</th><th>Staff flagged</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p>No manager-entered events recorded for the period.</p>')
      +'<p>PIN-authenticated events cannot independently identify who physically typed the PIN. Named staff details are available only in Shiftboard to authorised management.</p>'
      +'</section>';
  }
  function renderManagementPanel(s,nowMs){
    if(!s||!s.admin||s.admin.role!=='super')return '';
    const r=reportFromState(s,nowMs);
    const staffRows=r.flagged.map(f=>'<tr><td>'+esc(f.name)+'</td><td>'+esc(f.siteName)+'</td><td>'+f.managerEntered+'</td><td>'+f.days+'</td><td>'+esc(f.managerNames.join(', ')||'Not recorded')+'</td></tr>').join('');
    const siteRows=r.bySite.filter(x=>x.managerEntered||x.managerEdited)
      .map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.events+'</td><td>'+x.managerEntered+'</td><td>'+x.managerEdited+'</td><td>'+x.flaggedStaff+'</td></tr>').join('');
    const mRows=r.byManager.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.count+'</td></tr>').join('');
    return '<section aria-label="Upper management clocking and PIN review" style="margin:0 0 24px">'
      +'<h2>Clocking &amp; PIN Control · Upper Management</h2>'
      +'<div class="head-sub">Rolling 7 days (UK time). Review staff with 3+ manager-entered clock-ins/outs on at least 2 separate days. No emails are sent by this audit.</div>'
      +'<div class="card"><div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px">'
      +'<div><div style="color:var(--muted);font-size:12px">Clock events</div><b style="font-size:24px">'+r.totalEvents+'</b></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Manager-entered</div><b style="font-size:24px">'+r.managerEntered+'</b></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Manager corrections</div><b style="font-size:24px">'+r.managerEdited+'</b></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Staff for review</div><b style="font-size:24px;color:'+(r.flagged.length?'var(--red)':'var(--green)')+'">'+r.flagged.length+'</b></div>'
      +'</div><div style="font-size:12px;color:var(--muted)">Events without a manager marker: '+r.unmarkedEvents+'. An unmarked event is not proof the employee entered the PIN themselves. Manager names are the recorded labels, not independently verified actor identities.</div></div>'
      +'<div class="card"><h3 style="margin-bottom:10px">Repeated manager-entered clockings</h3>'
      +(staffRows?'<div style="overflow:auto"><table><thead><tr><th>Employee</th><th>Home centre</th><th>Events</th><th>Separate days</th><th>Recorded manager</th></tr></thead><tbody>'+staffRows+'</tbody></table></div>'
          :'<div class="empty-state">No staff meet the repeat-use threshold in the last 7 days.</div>')
      +'<div style="font-size:12px;color:var(--muted);margin-top:10px">Review each case with the centre; manual help may be legitimate. The flag does not prove PIN sharing or misconduct.</div></div>'
      +'<div class="card"><h3 style="margin-bottom:10px">Centre breakdown</h3>'
      +(siteRows?'<div style="overflow:auto"><table><thead><tr><th>Centre where clocked</th><th>All events</th><th>Manager-entered</th><th>Edits</th><th>Flagged home staff</th></tr></thead><tbody>'+siteRows+'</tbody></table></div>'
              :'<div class="empty-state">No manager interventions recorded in this period.</div>')
      +(mRows?'<details style="margin-top:15px"><summary style="cursor:pointer">Recorded manager names (not separately authenticated)</summary><table><thead><tr><th>Name on record</th><th>Manual clock events</th></tr></thead><tbody>'+mRows+'</tbody></table></details>':'')
      +'</div></section>';
  }
  function renderTonySummary(s,nowMs){
    if(!s||!s.admin||s.admin.role!=='super')return '';
    const r=reportFromState(s,nowMs);
    return '<div class="card" style="border-left:4px solid '+(r.flagged.length?'var(--amber)':'var(--green)')+';margin-bottom:18px">'
      +'<b>Clocking &amp; PIN-control review · last 7 days</b>'
      +'<div style="margin-top:6px;font-size:13px;color:var(--muted)">'+r.managerEntered+' manager-entered clock events · '+r.managerEdited+' time corrections · '+r.flagged.length+' staff meet the repeated-use threshold.</div>'
      +'<div style="margin-top:6px;font-size:12px;color:var(--muted)">Details: Upper Management → Attendance → Clock Log. Counts are recorded interventions, not proof of PIN misuse.</div></div>';
  }
  return {audit,reportFromState,emailSummaryHtml,renderManagementPanel,renderTonySummary};
});
