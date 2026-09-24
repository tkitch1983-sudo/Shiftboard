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

    // Company Bradford policy supplied in the July 2026 attendance register.
    // Effective 01/08/2025 to 31/12/2026.
    window.bradfordPolicyForScore=function(score){
      const n=Math.max(0,Number(score)||0);
      if(n<=50) return {range:'0–50',label:'No Action',className:'pill-approved'};
      if(n<=124) return {range:'51–124',label:'Verbal Warning (documented)',className:'pill-pending'};
      if(n<=399) return {range:'125–399',label:'Written Warning',className:'pill-rejected'};
      if(n<=649) return {range:'400–649',label:'Final Written Warning',className:'pill-rejected'};
      return {range:'650+',label:'Dismissal',className:'pill-rejected'};
    };

    if(typeof renderAdminBradford==='function'){
      renderAdminBradford=function(){
        const isSuper=state.admin.role==='super';
        const asOf=iso(new Date());
        const win=bradfordWindow(asOf);
        const effectiveSite=isSuper?(state.admin.bradSite||'all'):state.admin.scopeSite;
        const employees=(state.config.employees||[])
          .filter(e=>e.active!==false && employeeInScope(e) && (effectiveSite==='all' || e.siteId===effectiveSite));
        const stats=employees.map(e=>bradfordStatsForEmployee(e,asOf))
          .sort((a,b)=>b.score-a.score || b.spells-a.spells || b.days-a.days || a.employee.name.localeCompare(b.employee.name));
        const withSickness=stats.filter(x=>x.days>0).length;
        const highest=stats.length?Math.max(...stats.map(x=>x.score)):0;
        const siteOptions=`<option value="all">All sites</option>`+(state.config.sites||[]).map(site=>`<option value="${site.id}" ${state.admin.bradSite===site.id?'selected':''}>${site.name}</option>`).join('');
        const rows=stats.map((x,i)=>{
          const policy=bradfordPolicyForScore(x.score);
          return `<tr>
            <td class="mono">${i+1}</td>
            <td>${x.employee.name}</td>
            ${isSuper?`<td>${siteName(x.employee.siteId)}</td>`:''}
            <td class="mono">${x.spells}</td>
            <td class="mono">${x.days}</td>
            <td class="mono"><b>${x.score}</b></td>
            <td><span class="pill ${policy.className}" title="Bradford policy band ${policy.range}">${policy.label}</span></td>
            <td>${x.lastDate?fmtDate(x.lastDate):'<span style="color:var(--muted-2);">—</span>'}</td>
          </tr>`;
        }).join('');

        return `
        <h2>Bradford Factor</h2>
        <div class="head-sub">Automatically calculated from recorded sickness over the rolling 52 weeks. Formula: <b>S² × D</b>, where S is the number of sickness spells and D is the total sick workdays.</div>
        <div class="card" style="margin-bottom:14px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;"><b>Company discipline levels</b> · effective 1 Aug 2025 to 31 Dec 2026</div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;font-size:11px;">
            <span class="pill pill-approved">0–50 · No Action</span>
            <span class="pill pill-pending">51–124 · Verbal Warning (documented)</span>
            <span class="pill pill-rejected">125–399 · Written Warning</span>
            <span class="pill pill-rejected">400–649 · Final Written Warning</span>
            <span class="pill pill-rejected">650+ · Dismissal</span>
          </div>
        </div>
        <div class="card">
          <div class="form-row" style="margin-bottom:0;">
            ${isSuper?`<div class="field" style="max-width:260px;"><label>Site</label><select id="bradford-site-select">${siteOptions}</select></div>`:''}
            <div style="font-size:12px;color:var(--muted);align-self:center;">Period: <b>${fmtDate(win.startIso)}</b> to <b>${fmtDate(win.endIso)}</b></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px;">
          <div class="card" style="margin:0;"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Employees shown</div><div class="mono" style="font-size:24px;margin-top:5px;">${stats.length}</div></div>
          <div class="card" style="margin:0;"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">With sickness</div><div class="mono" style="font-size:24px;margin-top:5px;">${withSickness}</div></div>
          <div class="card" style="margin:0;"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Highest factor</div><div class="mono" style="font-size:24px;margin-top:5px;">${highest}</div></div>
        </div>
        <div class="card"><table>
          <thead><tr><th>#</th><th>Employee</th>${isSuper?'<th>Site</th>':''}<th>Spells (S)</th><th>Sick days (D)</th><th>Bradford</th><th>Discipline level</th><th>Last sick day</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="${isSuper?8:7}" class="empty-state">No employees to show.</td></tr>`}</tbody>
        </table></div>
        <div style="font-size:12px;color:var(--muted-2);line-height:1.5;">The policy level is shown from the Bradford score. It should not be treated as an automatic outcome: individual circumstances, disability-related absence and other relevant factors should be reviewed before any action is taken.</div>`;
      };
    }

    if(typeof state!=='undefined' && state.admin && state.admin.authed && state.admin.tab==='bradford' && typeof render==='function'){
      setTimeout(function(){ try{ render(); }catch(_e){} },0);
    }
  }catch(err){
    console.error('Bradford policy fix failed:',err);
  }
})();
