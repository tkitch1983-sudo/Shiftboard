(function(){
  'use strict';

  const TAB='fullreport';
  let cache={key:'',loading:false,error:'',data:null};

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function money(v){return '£'+num(v).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});}
  function dec(v,d){return num(v).toLocaleString('en-GB',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
  function pct(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'—';}
  function currentMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function monthStart(m){return String(m||currentMonth()).slice(0,7)+'-01';}
  function monthEnd(m){
    const p=String(m||currentMonth()).split('-').map(Number);
    const d=new Date(p[0],p[1],0,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function previousMonth(m){
    const p=String(m).split('-').map(Number),d=new Date(p[0],p[1]-2,1,12);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthLabel(m){return new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
  function fmtDate(v){
    if(!v)return '—';const d=new Date(String(v).slice(0,10)+'T12:00:00');
    return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }
  function siteNameLocal(id){
    const s=((state.config&&state.config.sites)||[]).find(function(x){return String(x.id)===String(id);});
    return s?s.name:String(id||'');
  }
  function reportSites(){
    return ((state.config&&state.config.sites)||[]).filter(function(s){
      const n=String(s.name||'').toLowerCase();
      return n!=='upper management'&&n!=='floaters';
    });
  }
  function workshopSites(){
    try{return typeof targetWorkshopSites==='function'?targetWorkshopSites().map(function(x){return x.site;}):reportSites().filter(function(s){return !(typeof isFillingStationSite==='function'&&isFillingStationSite(s.id));});}
    catch(_e){return reportSites();}
  }
  function siteKeyFor(site){
    try{if(typeof bonusSiteKey==='function')return bonusSiteKey(site&&site.name);}catch(_e){}
    const n=String(site&&site.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(n.indexOf('etacworkshop')>=0)return 'peterlee';
    if(n.indexOf('chester')>=0)return 'chester';
    return n;
  }
  function siteForKey(key){
    key=String(key||'').toLowerCase();
    return reportSites().find(function(s){return siteKeyFor(s)===key;})||null;
  }
  function activeEmployees(siteId){
    return ((state.config&&state.config.employees)||[]).filter(function(e){
      return e.active!==false&&(!siteId||siteId==='all'||String(e.siteId)===String(siteId));
    });
  }
  function dateInRange(ds,start,end){return !!ds&&String(ds)>=start&&String(ds)<=end;}

  async function api(path){
    const res=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers:await authHeaders(),cache:'no-store'});
    if(!res.ok)throw new Error('Report data '+res.status);
    return res.json();
  }

  function hoursOverrideMap(start,end){
    const out=new Map();
    const extras=state.timesheetExtras||{};
    Object.keys(extras).forEach(function(wk){
      const emps=(extras[wk]&&extras[wk].employees)||{};
      Object.keys(emps).forEach(function(empId){
        const map=emps[empId].hoursOverride||{};
        Object.keys(map).forEach(function(ds){
          if(dateInRange(ds,start,end)&&String(map[ds]).trim()!=='')out.set(empId+'|'+ds,num(map[ds]));
        });
      });
    });
    return out;
  }

  function attendanceByEmployee(month){
    const start=monthStart(month),end=monthEnd(month),overrides=hoursOverrideMap(start,end);
    let shifts={};
    try{shifts=computeAllShifts();}catch(_e){shifts={};}
    const result=new Map();
    activeEmployees().forEach(function(emp){
      const all=((shifts[emp.id]&&shifts[emp.id].shifts)||[]).filter(function(s){return dateInRange(s.date,start,end);});
      const byDate={};
      all.forEach(function(s){(byDate[s.date]=byDate[s.date]||[]).push(s);});
      let hours=0,autoClosed=0,workedDays=0,manual=0;
      Object.keys(byDate).forEach(function(ds){
        let h=0;
        try{h=paidHoursForDay(byDate[ds],ds,emp.siteId,emp);}catch(_e){
          h=byDate[ds].reduce(function(n,s){return n+Math.max(0,(num(s.outTs)-num(s.inTs))/3600000);},0);
        }
        const k=emp.id+'|'+ds;
        if(overrides.has(k)){h=overrides.get(k);manual++;}
        if(h>0)workedDays++;
        hours+=h;
        autoClosed+=byDate[ds].filter(function(s){return !!s.autoClosed;}).length;
      });
      result.set(String(emp.id),{hours:hours,workedDays:workedDays,autoClosed:autoClosed,manual:manual});
    });
    return result;
  }

  function peopleMetrics(month,payRates){
    const start=monthStart(month),end=monthEnd(month);
    const attendance=attendanceByEmployee(month);
    const rateMap=new Map((payRates||[]).map(function(r){return [String(r.employee_id),num(r.pay_rate)];}));
    const sickRows=(state.absences||[]).filter(function(a){return a&&a.type==='sick'&&dateInRange(a.date,start,end);});
    const sickBy=new Map();
    sickRows.forEach(function(a){sickBy.set(String(a.employeeId),(sickBy.get(String(a.employeeId))||0)+1);});

    const holBy=new Map(),pendingBy=new Map();
    (state.requests||[]).forEach(function(r){
      if(!r||!Array.isArray(r.dates))return;
      r.dates.forEach(function(d){
        let ds='',amt=1;
        try{ds=typeof dateEntryDate==='function'?dateEntryDate(d):(typeof d==='string'?d:d.date);amt=typeof dateEntryAmount==='function'?dateEntryAmount(d):(typeof d==='object'&&d.amount!=null?num(d.amount):1);}catch(_e){ds=typeof d==='string'?d:d&&d.date;}
        if(!dateInRange(ds,start,end))return;
        const map=r.status==='approved'?holBy:r.status==='pending'?pendingBy:null;
        if(map)map.set(String(r.employeeId),(map.get(String(r.employeeId))||0)+num(amt||1));
      });
    });

    const bonus=((state.bonusSheets||{})[month]||{}).employees||{};
    const rows=activeEmployees().map(function(emp){
      const att=attendance.get(String(emp.id))||{hours:0,workedDays:0,autoClosed:0,manual:0};
      let brad={score:0,spells:0,days:0};
      try{
        const asOf=end<new Date().toISOString().slice(0,10)?end:new Date().toISOString().slice(0,10);
        if(typeof bradfordStatsForEmployee==='function')brad=bradfordStatsForEmployee(emp,asOf);
      }catch(_e){}
      const b=bonus[String(emp.id)]||{};
      const bonusNet=num(b.owed)+num(b.extra)-num(b.damages);
      const rate=rateMap.has(String(emp.id))?rateMap.get(String(emp.id)):null;
      return {
        id:String(emp.id),name:String(emp.name||''),siteId:String(emp.siteId||''),
        hours:att.hours,workedDays:att.workedDays,autoClosed:att.autoClosed,manual:att.manual,
        sick:sickBy.get(String(emp.id))||0,holiday:holBy.get(String(emp.id))||0,pendingHoliday:pendingBy.get(String(emp.id))||0,
        bradford:num(brad.score),spells:num(brad.spells),rollingSickDays:num(brad.days),
        bonus:bonusNet,payRate:rate,payReference:rate===null?null:att.hours*rate
      };
    });
    return rows;
  }

  function targetFor(siteId,month){
    const plan=state.targetSheets&&state.targetSheets[month],s=plan&&plan.sites&&plan.sites[siteId];
    if(!s)return null;
    return {target:num(s.monthlyTarget),actual:(s.days||[]).reduce(function(n,d){return n+(String(d.actual||'').trim()===''?0:num(d.actual));},0)};
  }

  function weeklyComplete(row){
    if(!row)return false;
    try{
      const s=((state.config&&state.config.sites)||[]).find(function(x){return String(x.id)===String(row.site_id);});
      if(typeof weeklyRecordComplete==='function')return weeklyRecordComplete(row,s);
    }catch(_e){}
    return !!(row.weekly_timesheet_done&&row.site_cleaning_done&&row.stock_take_done&&row.oxy_acetylene_done);
  }
  function weeklyIssueText(row){
    const issues=[];
    if(!weeklyComplete(row))issues.push('weekly checks incomplete');
    if(String(row.flag_status||'ok').toLowerCase()!=='ok')issues.push('flag: '+row.flag_status);
    if(String(row.mot_log_status||'up_to_date').toLowerCase()!=='up_to_date')issues.push('MOT log: '+row.mot_log_status);
    if(String(row.maintenance_status||'OK').toUpperCase()!=='OK')issues.push('maintenance: '+row.maintenance_status);
    if(row.vehicles_left_status&&String(row.vehicles_left_status).toLowerCase()!=='no vehicles left on site')issues.push('vehicles left: '+row.vehicles_left_status);
    if(row.alarm_callout_status&&String(row.alarm_callout_status).toLowerCase()!=='not required')issues.push('alarm: '+row.alarm_callout_status);
    if(String(row.notes||'').trim())issues.push(String(row.notes).trim());
    return issues;
  }

  function hsIssues(check){
    if(!check)return [];
    const src=(check.draft_checks&&Object.keys(check.draft_checks).length?check.draft_checks:check.checks)||{};
    const out=[];
    Object.keys(src).forEach(function(k){
      const r=src[k]||{};
      if(String(r.status||'')==='issue')out.push((r.label||k)+(r.note?' — '+r.note:''));
    });
    if(String(check.draft_manager_notes||check.manager_notes||'').trim())out.push('Manager note — '+String(check.draft_manager_notes||check.manager_notes).trim());
    return out;
  }

  async function load(month,force){
    const key=month;
    if(cache.loading)return;
    if(!force&&cache.key===key&&cache.data)return;
    cache={key:key,loading:true,error:'',data:null};
    try{
      const ms=monthStart(month),me=monthEnd(month),prev=previousMonth(month),prevStart=monthStart(prev);
      const weeklyFrom=(function(){const d=new Date(ms+'T12:00:00'),day=d.getDay(),diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d.toISOString().slice(0,10);})();
      const q=await Promise.all([
        api('site_sales_analysis_monthly?select=*&month_start=eq.'+encodeURIComponent(ms)),
        api('site_sales_analysis_monthly?select=*&month_start=eq.'+encodeURIComponent(prevStart)),
        api('stock_value_snapshots?select=*&snapshot_date=gte.'+encodeURIComponent(ms)+'&snapshot_date=lte.'+encodeURIComponent(me)+'&order=snapshot_date.desc'),
        api('weekly_site_checks?select=*&week_start=gte.'+encodeURIComponent(weeklyFrom)+'&week_start=lte.'+encodeURIComponent(me)+'&order=week_start.desc'),
        api('monthly_hs_checks?select=*&month_start=eq.'+encodeURIComponent(ms)),
        api('monthly_hs_acknowledgements?select=*&month_start=eq.'+encodeURIComponent(ms)),
        api('mot_monthly_qc?select=*&month_start=eq.'+encodeURIComponent(ms)),
        api('staff_pay_rates?select=employee_id,pay_rate')
      ]);
      const latestStock=new Map();
      (q[2]||[]).forEach(function(r){if(!latestStock.has(String(r.site_key)))latestStock.set(String(r.site_key),r);});
      cache.data={
        month:month,sales:q[0]||[],prevSales:q[1]||[],stock:latestStock,weekly:q[3]||[],hs:q[4]||[],acks:q[5]||[],mot:q[6]||[],payRates:q[7]||[]
      };
    }catch(err){cache.error=err&&err.message?err.message:String(err);}
    cache.loading=false;
    try{if(state.admin&&state.admin.tab===TAB&&typeof render==='function')render();}catch(_e){}
  }

  function buildModel(month){
    const d=cache.data||{sales:[],prevSales:[],stock:new Map(),weekly:[],hs:[],acks:[],mot:[],payRates:[]};
    const people=peopleMetrics(month,d.payRates);
    const salesBy=new Map((d.sales||[]).map(function(r){return [String(r.site_key),r];}));
    const prevBy=new Map((d.prevSales||[]).map(function(r){return [String(r.site_key),r];}));
    const hsBy=new Map((d.hs||[]).map(function(r){return [String(r.site_id),r];}));
    const motBy=new Map((d.mot||[]).map(function(r){return [String(r.site_id),r];}));
    const acksBy=new Map();
    (d.acks||[]).forEach(function(a){acksBy.set(String(a.site_id),(acksBy.get(String(a.site_id))||0)+1);});

    const sites=reportSites().map(function(site){
      const sitePeople=people.filter(function(p){return p.siteId===String(site.id);});
      const key=siteKeyFor(site),sales=salesBy.get(key)||null,prev=prevBy.get(key)||null,tar=targetFor(site.id,month);
      const stock=d.stock instanceof Map?d.stock.get(key):null;
      const weekly=(d.weekly||[]).filter(function(r){return String(r.site_id)===String(site.id);});
      const complete=weekly.filter(weeklyComplete).length;
      const weeklyIssues=[];
      weekly.forEach(function(r){weeklyIssueText(r).forEach(function(x){weeklyIssues.push(fmtDate(r.week_start)+' — '+x);});});
      const hs=hsBy.get(String(site.id))||null,hsIssueList=hsIssues(hs),expected=Array.isArray(hs&&hs.expected_staff)?hs.expected_staff.length:0,acked=acksBy.get(String(site.id))||0;
      const mot=motBy.get(String(site.id))||null;
      const bonus=sitePeople.reduce(function(n,p){return n+p.bonus;},0);
      return {
        id:String(site.id),name:String(site.name||''),key:key,people:sitePeople,
        headcount:sitePeople.length,hours:sitePeople.reduce(function(n,p){return n+p.hours;},0),
        sickness:sitePeople.reduce(function(n,p){return n+p.sick;},0),
        holidays:sitePeople.reduce(function(n,p){return n+p.holiday;},0),
        pendingHoliday:sitePeople.reduce(function(n,p){return n+p.pendingHoliday;},0),
        autoClosed:sitePeople.reduce(function(n,p){return n+p.autoClosed;},0),
        manual:sitePeople.reduce(function(n,p){return n+p.manual;},0),
        highBradford:sitePeople.filter(function(p){return p.bradford>=200;}).length,
        sales:sales?num(sales.total_net):0,margin:sales?sales.margin_pct:null,upsell:sales?num(sales.upsell_value):0,
        previousSales:prev?num(prev.total_net):0,target:tar?tar.target:0,targetActual:tar?tar.actual:0,
        stock:stock?num(stock.stock_value):0,stockDate:stock?stock.snapshot_date:null,
        weeklyCount:weekly.length,weeklyComplete:complete,weeklyIssues:weeklyIssues,
        hs:hs,hsIssues:hsIssueList,hsExpected:expected,hsAcked:acked,
        mot:mot,bonus:bonus,payReference:sitePeople.reduce(function(n,p){return n+(p.payReference||0);},0)
      };
    });
    return {month:month,people:people,sites:sites};
  }

  function variance(s){const actual=s.sales||s.targetActual;return actual-s.target;}
  function changePct(cur,prev){return prev?((cur-prev)/Math.abs(prev))*100:null;}
  function pill(text,kind){
    const bg=kind==='bad'?'var(--red-dim)':kind==='warn'?'var(--panel-2)':'var(--green-dim)';
    const col=kind==='bad'?'var(--red)':kind==='warn'?'var(--amber)':'var(--green)';
    return '<span class="pill" style="background:'+bg+';color:'+col+';">'+esc(text)+'</span>';
  }

  function issuesForSite(s){
    const out=[];
    s.weeklyIssues.forEach(function(x){out.push({type:'Weekly checks',text:x});});
    s.hsIssues.forEach(function(x){out.push({type:'Monthly H&S',text:x});});
    if(s.hs&&s.hs.status==='published'&&s.hsExpected>s.hsAcked)out.push({type:'H&S acknowledgement',text:(s.hsExpected-s.hsAcked)+' staff outstanding'});
    if(s.mot&&!s.mot.completed)out.push({type:'MOT QC',text:'Monthly MOT QC is not complete'});
    if(s.mot&&String(s.mot.issues_found||'').trim())out.push({type:'MOT QC',text:String(s.mot.issues_found).trim()});
    if(s.autoClosed)out.push({type:'Attendance',text:s.autoClosed+' automatic clock-out'+(s.autoClosed===1?'':'s')+' to review'});
    if(s.pendingHoliday)out.push({type:'Holiday',text:dec(s.pendingHoliday,2)+' pending holiday day'+(s.pendingHoliday===1?'':'s')});
    return out;
  }

  function comparisonTable(model){
    const rows=model.sites.map(function(s){
      const actual=s.sales||s.targetActual,v=variance(s),chg=changePct(s.sales,s.previousSales);
      const issueCount=issuesForSite(s).length;
      return '<tr>'
        +'<td><b>'+esc(s.name)+'</b></td><td>'+s.headcount+'</td><td>'+dec(s.hours,2)+'</td><td>'+s.sickness+'</td><td>'+dec(s.holidays,2)+'</td>'
        +'<td>'+money(s.sales)+'</td><td>'+money(s.target)+'</td><td style="color:'+(v<0?'var(--red)':'var(--green)')+';">'+(v>=0?'+':'')+money(v)+'</td>'
        +'<td>'+pct(s.margin)+'</td><td>'+money(s.stock)+'</td>'
        +'<td>'+(s.weeklyCount?pill(s.weeklyComplete+'/'+s.weeklyCount,s.weeklyComplete===s.weeklyCount?'good':'bad'):'—')+'</td>'
        +'<td>'+(s.hs?(s.hs.status==='published'?pill(s.hsAcked+'/'+s.hsExpected+' ack',s.hsAcked>=s.hsExpected?'good':'warn'):pill('Draft','warn')):'—')+'</td>'
        +'<td>'+(chg===null?'—':(chg>=0?'+':'')+chg.toFixed(1)+'%')+'</td>'
        +'<td>'+pill(String(issueCount),issueCount?'bad':'good')+'</td>'
        +'</tr>';
    }).join('');
    return '<div class="card" style="padding:0;overflow:auto;"><table style="min-width:1450px;margin:0;"><thead><tr><th>Site</th><th>Staff</th><th>Hours</th><th>Sick days</th><th>Holiday</th><th>Sales</th><th>Target</th><th>Variance</th><th>Margin</th><th>Stock</th><th>Weekly</th><th>H&S</th><th>Vs prev month</th><th>Issues</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function issuesHtml(sites){
    const rows=[];
    sites.forEach(function(s){issuesForSite(s).forEach(function(i){rows.push('<tr><td><b>'+esc(s.name)+'</b></td><td>'+esc(i.type)+'</td><td>'+esc(i.text)+'</td></tr>');});});
    return '<div class="card"><h3 style="margin-bottom:10px;">Issues to address</h3>'+(rows.length?'<div style="overflow:auto;"><table><thead><tr><th>Site</th><th>Area</th><th>Issue / action</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'<div style="color:var(--green);font-weight:700;">No saved issues found for this view.</div>')+'</div>';
  }

  function siteDetail(s){
    if(!s)return '';
    const peopleRows=s.people.slice().sort(function(a,b){return b.bradford-a.bradford||a.name.localeCompare(b.name);}).map(function(p){
      return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+dec(p.hours,2)+'</td><td>'+p.workedDays+'</td><td>'+p.sick+'</td><td>'+dec(p.holiday,2)+'</td><td>'+p.bradford+'</td><td>'+p.autoClosed+'</td><td>'+p.manual+'</td><td>'+money(p.bonus)+'</td><td>'+(p.payRate===null?'—':money(p.payRate))+'</td><td>'+(p.payReference===null?'—':money(p.payReference))+'</td></tr>';
    }).join('');
    const hs=s.hs,weekly=s.weeklyCount?s.weeklyComplete+'/'+s.weeklyCount:'—';
    return '<div class="card"><h3 style="margin-bottom:10px;">'+esc(s.name)+' · site detail</h3>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px;">'
      +'<div><small>Sales</small><div class="mono">'+money(s.sales)+'</div></div><div><small>Target</small><div class="mono">'+money(s.target)+'</div></div>'
      +'<div><small>Margin</small><div class="mono">'+pct(s.margin)+'</div></div><div><small>Upsell</small><div class="mono">'+money(s.upsell)+'</div></div>'
      +'<div><small>Stock</small><div class="mono">'+money(s.stock)+'</div></div><div><small>Bonus total</small><div class="mono">'+money(s.bonus)+'</div></div>'
      +'<div><small>Weekly checks</small><div class="mono">'+weekly+'</div></div><div><small>H&S</small><div class="mono">'+(hs?esc(String(hs.status||'').toUpperCase())+' · '+s.hsAcked+'/'+s.hsExpected+' ack':'—')+'</div></div>'
      +'</div><div style="overflow:auto;"><table style="min-width:1050px;"><thead><tr><th>Employee</th><th>Hours</th><th>Days worked</th><th>Sick</th><th>Holiday</th><th>Bradford</th><th>Auto-close</th><th>Manual edits</th><th>Bonus</th><th>Pay rate</th><th>Hours × rate</th></tr></thead><tbody>'+peopleRows+'</tbody></table></div></div>';
  }

  function renderReport(){
    if(!isTonyLogin())return '<h2>Full Report</h2><div class="card">This report is private to Tony.</div>';
    if(state.admin.fullReportMonth===undefined)state.admin.fullReportMonth=currentMonth();
    if(state.admin.fullReportSite===undefined)state.admin.fullReportSite='all';
    const month=state.admin.fullReportMonth||currentMonth(),siteId=state.admin.fullReportSite||'all';
    if(cache.key!==month&&!cache.loading)setTimeout(function(){load(month,false);},0);
    const siteOptions='<option value="all" '+(siteId==='all'?'selected':'')+'>Group comparison</option>'+reportSites().map(function(s){return '<option value="'+esc(s.id)+'" '+(siteId===String(s.id)?'selected':'')+'>'+esc(s.name)+'</option>';}).join('');
    let body='';
    if(cache.loading&&!cache.data)body='<div class="card">Loading full report data…</div>';
    else if(cache.error)body='<div class="card" style="border-left:4px solid var(--red);color:var(--red);">'+esc(cache.error)+'</div>';
    else if(cache.data){
      const model=buildModel(month),selected=siteId==='all'?null:model.sites.find(function(s){return s.id===siteId;});
      const viewed=selected?[selected]:model.sites;
      body='<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px;">'
        +'<div class="card" style="margin:0;"><small>Sites</small><div class="mono" style="font-size:24px;">'+viewed.length+'</div></div>'
        +'<div class="card" style="margin:0;"><small>Recorded hours</small><div class="mono" style="font-size:24px;">'+dec(viewed.reduce(function(n,s){return n+s.hours;},0),2)+'</div></div>'
        +'<div class="card" style="margin:0;"><small>Sales</small><div class="mono" style="font-size:24px;">'+money(viewed.reduce(function(n,s){return n+s.sales;},0))+'</div></div>'
        +'<div class="card" style="margin:0;"><small>Issues</small><div class="mono" style="font-size:24px;">'+viewed.reduce(function(n,s){return n+issuesForSite(s).length;},0)+'</div></div></div>'
        +(siteId==='all'?comparisonTable(model):comparisonTable({sites:viewed}))
        +issuesHtml(viewed)
        +(selected?siteDetail(selected):'');
    }
    return '<h2>Full Group Report</h2><div class="head-sub">Tony-only monthly management report combining attendance, sickness, Bradford, holidays, timesheets, targets, sales, stock, bonuses, weekly checks, Monthly H&S, MOT QC and payroll reference data. Passwords and security credentials are deliberately excluded.</div>'
      +'<div class="card no-print" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;">'
      +'<label style="font-size:11px;color:var(--muted);">Month<input id="full-report-month" type="month" value="'+esc(month)+'" style="display:block;margin-top:5px;"></label>'
      +'<label style="font-size:11px;color:var(--muted);">View<select id="full-report-site" style="display:block;margin-top:5px;min-width:220px;">'+siteOptions+'</select></label>'
      +'<button type="button" class="add-btn" data-full-report-refresh>Refresh data</button>'
      +'<button type="button" class="add-btn" data-full-report-print="group" style="margin-left:auto;">Print group report</button>'
      +(siteId!=='all'?'<button type="button" class="add-btn" data-full-report-print="site">Print '+esc(siteNameLocal(siteId))+'</button>':'')
      +'</div>'+body;
  }

  function printCss(){
    return '@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;font-size:9px;margin:0}h1{font-size:20px;margin:0}h2{font-size:14px;margin:14px 0 6px}h3{font-size:12px;margin:10px 0 5px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:4px;vertical-align:top}th{background:#eee;text-align:left}.meta{font-size:9px;color:#555;margin-top:3px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.box{border:1px solid #aaa;padding:6px}.issue{border-left:3px solid #c62828;padding-left:6px}.page{page-break-before:always}.nowrap{white-space:nowrap}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  }
  function printable(model,scope){
    const sites=scope==='group'?model.sites:model.sites.filter(function(s){return s.id===state.admin.fullReportSite;});
    const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" alt="North East Auto Services" data-neas-print-brand="1" style="max-width:175px;max-height:48px;">':'';
    const comparison='<table><thead><tr><th>Site</th><th>Staff</th><th>Hours</th><th>Sick</th><th>Holiday</th><th>Sales</th><th>Target</th><th>Variance</th><th>Margin</th><th>Stock</th><th>Weekly</th><th>H&S ack</th><th>Issues</th></tr></thead><tbody>'+sites.map(function(s){
      return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+s.headcount+'</td><td>'+dec(s.hours,2)+'</td><td>'+s.sickness+'</td><td>'+dec(s.holidays,2)+'</td><td>'+money(s.sales)+'</td><td>'+money(s.target)+'</td><td>'+money(variance(s))+'</td><td>'+pct(s.margin)+'</td><td>'+money(s.stock)+'</td><td>'+s.weeklyComplete+'/'+s.weeklyCount+'</td><td>'+s.hsAcked+'/'+s.hsExpected+'</td><td>'+issuesForSite(s).length+'</td></tr>';
    }).join('')+'</tbody></table>';
    const issueRows=[];
    sites.forEach(function(s){issuesForSite(s).forEach(function(i){issueRows.push('<tr><td><b>'+esc(s.name)+'</b></td><td>'+esc(i.type)+'</td><td>'+esc(i.text)+'</td></tr>');});});
    const details=sites.map(function(s){
      const staff=s.people.slice().sort(function(a,b){return b.bradford-a.bradford||a.name.localeCompare(b.name);}).map(function(p){
        return '<tr><td>'+esc(p.name)+'</td><td>'+dec(p.hours,2)+'</td><td>'+p.sick+'</td><td>'+dec(p.holiday,2)+'</td><td>'+p.bradford+'</td><td>'+p.autoClosed+'</td><td>'+p.manual+'</td><td>'+money(p.bonus)+'</td><td>'+(p.payRate===null?'—':money(p.payRate))+'</td></tr>';
      }).join('');
      return '<div class="page"><h2>'+esc(s.name)+' · detail</h2><div class="grid"><div class="box"><b>Sales</b><br>'+money(s.sales)+'</div><div class="box"><b>Target</b><br>'+money(s.target)+'</div><div class="box"><b>Margin</b><br>'+pct(s.margin)+'</div><div class="box"><b>Stock</b><br>'+money(s.stock)+'</div></div><h3>Staff / attendance</h3><table><thead><tr><th>Employee</th><th>Hours</th><th>Sick days</th><th>Holiday</th><th>Bradford</th><th>Auto-close</th><th>Manual edits</th><th>Bonus</th><th>Pay rate</th></tr></thead><tbody>'+staff+'</tbody></table><h3>Compliance</h3><table><tbody><tr><th>Weekly checks</th><td>'+s.weeklyComplete+' of '+s.weeklyCount+' complete</td></tr><tr><th>Monthly H&S</th><td>'+(s.hs?esc(String(s.hs.status||'').toUpperCase())+' · '+s.hsAcked+' of '+s.hsExpected+' acknowledged':'No record')+'</td></tr><tr><th>MOT QC</th><td>'+(s.mot?(s.mot.completed?'Complete':'Outstanding')+(s.mot.issues_found?' · '+esc(s.mot.issues_found):''):'No record')+'</td></tr></tbody></table></div>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>NEAS Full Report · '+esc(monthLabel(model.month))+'</title><style>'+printCss()+'</style></head><body>'
      +'<header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #d71920;padding-bottom:7px;margin-bottom:10px;"><div><h1>Full Management Report</h1><div class="meta">'+esc(scope==='group'?'Group comparison':siteNameLocal(state.admin.fullReportSite))+' · '+esc(monthLabel(model.month))+'</div><div class="meta">Generated '+esc(new Date().toLocaleString('en-GB'))+' · Tony management report</div></div>'+logo+'</header>'
      +'<h2>Comparison overview</h2>'+comparison
      +'<h2>Issues to address</h2>'+(issueRows.length?'<table><thead><tr><th>Site</th><th>Area</th><th>Issue / action</th></tr></thead><tbody>'+issueRows.join('')+'</tbody></table>':'<div>No saved issues found.</div>')
      +details
      +'<div style="margin-top:10px;font-size:8px;color:#555;">Compiled from Shiftboard attendance, sickness, Bradford, holiday, timesheet, sales, target, stock, bonus, weekly check, Monthly H&S, MOT QC and pay-rate records. Passwords and security credentials are not included.</div>'
      +'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})<\/script></body></html>';
  }

  function printReport(scope){
    if(!cache.data){showToast('Wait for the report data to finish loading.',true);return;}
    const model=buildModel(state.admin.fullReportMonth||currentMonth());
    if(scope==='site'&&(state.admin.fullReportSite||'all')==='all'){showToast('Choose a site first.',true);return;}
    const w=window.open('about:blank','_blank','width=1200,height=900');
    if(!w){showToast('Allow pop-ups to print the report.',true);return;}
    w.document.open();w.document.write(printable(model,scope));w.document.close();
  }

  try{
    if(!ADMIN_TAB_OPTIONS.some(function(x){return x[0]===TAB;})){
      const at=ADMIN_TAB_OPTIONS.findIndex(function(x){return x[0]==='audit';});
      ADMIN_TAB_OPTIONS.splice(at>=0?at:ADMIN_TAB_OPTIONS.length,0,[TAB,'Full Report','Reports']);
    }
    if(state&&state.admin){
      if(state.admin.fullReportMonth===undefined)state.admin.fullReportMonth=currentMonth();
      if(state.admin.fullReportSite===undefined)state.admin.fullReportSite='all';
    }
    if(typeof renderAdmin==='function'){
      const oldRenderAdmin=renderAdmin;
      renderAdmin=function(){
        const html=oldRenderAdmin();
        if(!state.admin||state.admin.tab!==TAB)return html;
        const wrap=document.createElement('div');wrap.innerHTML=html;
        const main=wrap.querySelector('.admin-main');
        if(!main)return html;
        const top=main.querySelector('.admin-topbar');
        main.innerHTML=(top?top.outerHTML:'')+renderReport();
        return wrap.innerHTML;
      };
    }
  }catch(err){console.error('Full report setup failed',err);}

  document.addEventListener('change',function(e){
    const t=e.target;if(!t||!state.admin||state.admin.tab!==TAB)return;
    if(t.id==='full-report-month'){
      state.admin.fullReportMonth=t.value||currentMonth();cache={key:'',loading:false,error:'',data:null};if(typeof render==='function')render();
    }else if(t.id==='full-report-site'){
      state.admin.fullReportSite=t.value||'all';if(typeof render==='function')render();
    }
  },true);
  document.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('[data-full-report-refresh],[data-full-report-print]'):null;
    if(!t||!state.admin||state.admin.tab!==TAB)return;
    if(t.hasAttribute('data-full-report-refresh')){e.preventDefault();load(state.admin.fullReportMonth||currentMonth(),true);return;}
    if(t.hasAttribute('data-full-report-print')){e.preventDefault();printReport(t.getAttribute('data-full-report-print'));return;}
  },true);
})();