(function(){
  'use strict';

  const TAB_KEY='monthlyhs';
  const NON_WORKSHOP_IDS=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']);
  const CHECKS=[
    ['grinder','Grinder'],
    ['oxy_acetylene','Oxy Acetylene'],
    ['tyre_machine','Tyre Machine'],
    ['ramps','Ramps'],
    ['brake_rollers','Brake Rollers'],
    ['jacks','Jacks'],
    ['wheel_balancers','Wheel Balancers'],
    ['windy_tools','Windy Tools'],
    ['mig_welder','MIG Welder'],
    ['gas_analyser','Gas Analyser'],
    ['manual_handling','Manual Handling'],
    ['racking_stacking','Racking & Stacking'],
    ['step_ladders','Step Ladders'],
    ['housekeeping','Housekeeping'],
    ['ppe','P.P.E.'],
    ['coshh','COSHH']
  ];

  const adminCache=new Map();
  const kioskCache=new Map();
  const kioskLoading=new Set();
  let saving=false;
  let kioskPin='';
  let kioskError='';
  let kioskRecord=null;
  let kioskBusy=false;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function currentMonth(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthStart(month){ return String(month||currentMonth()).slice(0,7)+'-01'; }
  function fmtMonth(monthOrDate){
    const m=String(monthOrDate||currentMonth()).slice(0,7);
    const d=new Date(m+'-01T12:00:00');
    return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  }
  function fmtDateTime(v){
    if(!v) return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function sites(){ return ((state.config&&state.config.sites)||[]).slice(); }
  function siteFor(id){ return sites().find(function(s){return String(s.id)===String(id);}); }
  function isWorkshop(site){
    if(!site) return false;
    const id=String(site.id||''), name=String(site.name||'').toLowerCase();
    return !NON_WORKSHOP_IDS.has(id) && !/petrol|filling station|floaters|upper management/.test(name) && name!=='great ayton';
  }
  function workshopSites(){
    return sites().filter(isWorkshop).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
  }
  function selectedMonth(){
    if(!state.admin.monthlyHsMonth) state.admin.monthlyHsMonth=currentMonth();
    return String(state.admin.monthlyHsMonth).slice(0,7);
  }
  function selectedSiteId(){
    if(!state.admin) return '';
    if(state.admin.role!=='super') return String(state.admin.scopeSite||'');
    const ids=new Set(workshopSites().map(function(s){return String(s.id);}));
    if(ids.has(String(state.admin.monthlyHsSite||''))) return String(state.admin.monthlyHsSite);
    const first=workshopSites()[0];
    state.admin.monthlyHsSite=first?String(first.id):'';
    return state.admin.monthlyHsSite;
  }
  function cacheKey(siteId,month){ return String(siteId)+'|'+String(month).slice(0,7); }
  function cacheFor(siteId,month){
    const key=cacheKey(siteId,month);
    if(!adminCache.has(key)) adminCache.set(key,{loaded:false,loading:false,error:'',check:null,acks:[]});
    return adminCache.get(key);
  }

  async function loadAdminRecord(siteId,month,force){
    if(!siteId) return;
    const c=cacheFor(siteId,month);
    if(c.loading || (!force&&c.loaded)) return;
    c.loading=true; c.error='';
    try{
      const headers=await authHeaders();
      const base=SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&month_start=eq.'+encodeURIComponent(monthStart(month))+'&limit=1';
      const res=await fetch(base,{headers,cache:'no-store'});
      if(!res.ok) throw new Error('Monthly H&S '+res.status);
      const rows=await res.json();
      c.check=rows[0]||null;
      c.acks=[];
      if(c.check&&c.check.id){
        const ares=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_acknowledgements?select=*&check_id=eq.'+encodeURIComponent(c.check.id)+'&revision=eq.'+encodeURIComponent(c.check.revision)+'&order=employee_name.asc',{headers,cache:'no-store'});
        if(!ares.ok) throw new Error('Acknowledgements '+ares.status);
        c.acks=await ares.json();
      }
      c.loaded=true;
    }catch(err){
      c.error=err&&err.message?err.message:'Could not load monthly H&S checks.';
      c.loaded=true;
    }finally{
      c.loading=false;
      try{if(state.admin&&state.admin.authed&&typeof render==='function') render();}catch(_e){}
    }
  }

  function ensureAdminLoaded(){
    if(!state.admin||!state.admin.authed) return;
    if(state.admin.role==='site'&&!isWorkshop(siteFor(state.admin.scopeSite))) return;
    const sid=state.admin.tab===TAB_KEY?selectedSiteId():String(state.admin.scopeSite||'');
    const month=state.admin.tab===TAB_KEY?selectedMonth():currentMonth();
    if(sid){
      const c=cacheFor(sid,month);
      if(!c.loaded&&!c.loading) setTimeout(function(){loadAdminRecord(sid,month,false);},0);
    }
  }

  function statusText(v){ return v==='ok'?'OK':v==='issue'?'ISSUE':v==='na'?'N/A':'NOT SET'; }
  function statusColour(v){ return v==='ok'?'var(--green)':v==='issue'?'var(--red)':v==='na'?'var(--muted)':'var(--amber)'; }

  function renderCheckRows(check){
    const values=(check&&check.checks)||{};
    return CHECKS.map(function(item){
      const key=item[0], label=item[1], row=values[key]||{};
      const st=String(row.status||'');
      return '<tr>'
        +'<td style="font-weight:700;white-space:nowrap;">'+esc(label)+'</td>'
        +'<td style="width:170px;"><select data-monthly-status="'+esc(key)+'" style="width:100%;padding:9px;">'
          +'<option value="" '+(!st?'selected':'')+'>Select…</option>'
          +'<option value="ok" '+(st==='ok'?'selected':'')+'>OK</option>'
          +'<option value="issue" '+(st==='issue'?'selected':'')+'>Issue</option>'
          +'<option value="na" '+(st==='na'?'selected':'')+'>N/A</option>'
        +'</select></td>'
        +'<td><input data-monthly-note="'+esc(key)+'" value="'+esc(row.note||'')+'" placeholder="Optional note / issue details" style="width:100%;min-width:210px;padding:9px;"></td>'
      +'</tr>';
    }).join('');
  }

  function expectedStaffForDisplay(check,siteId,month){
    const snapshot=Array.isArray(check&&check.expected_staff)?check.expected_staff.slice():[];
    const byId=new Map(snapshot.map(function(x){return [String(x.id),{id:String(x.id),name:String(x.name||'')}];}));
    const c=cacheFor(siteId,month);
    (c.acks||[]).forEach(function(a){if(!byId.has(String(a.employee_id))) byId.set(String(a.employee_id),{id:String(a.employee_id),name:String(a.employee_name||'')});});
    return Array.from(byId.values()).sort(function(a,b){return a.name.localeCompare(b.name);});
  }

  function acknowledgementHtml(check,acks,siteId,month){
    if(!check||check.status!=='published') return '';
    const staff=expectedStaffForDisplay(check,siteId,month);
    const byId=new Map((acks||[]).map(function(a){return [String(a.employee_id),a];}));
    const done=staff.filter(function(s){return byId.has(String(s.id));}).length;
    const rows=staff.map(function(s){
      const a=byId.get(String(s.id));
      return '<tr><td><b>'+esc(s.name)+'</b></td><td><span class="pill '+(a?'pill-approved':'pill-rejected')+'">'+(a?'Acknowledged':'Outstanding')+'</span></td><td>'+(a?esc(fmtDateTime(a.acknowledged_at)):'—')+'</td></tr>';
    }).join('');
    return '<div class="card" style="margin-top:14px;">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;">'
      +'<div><h3 style="font-size:18px;">Staff acknowledgement</h3><div style="font-size:12px;color:var(--muted);margin-top:3px;">PIN acknowledgements for revision '+esc(check.revision)+'. PINs are not stored in this record.</div></div>'
      +'<div style="font-size:13px;"><b>'+done+'</b> of <b>'+staff.length+'</b> acknowledged</div></div>'
      +'<div style="overflow:auto;"><table><thead><tr><th>Employee</th><th>Status</th><th>Date / time</th></tr></thead><tbody>'+(rows||'<tr><td colspan="3">No staff were on the acknowledgement list when this was published.</td></tr>')+'</tbody></table></div>'
      +'</div>';
  }

  function renderMonthlyAdmin(){
    ensureAdminLoaded();
    const sid=selectedSiteId(), month=selectedMonth(), site=siteFor(sid), c=cacheFor(sid,month);
    if(!site) return '<h2>Monthly H&S Checks</h2><div class="card">No workshop site is available.</div>';
    const isSuper=state.admin.role==='super';
    const siteOptions=workshopSites().map(function(s){return '<option value="'+esc(s.id)+'" '+(String(s.id)===sid?'selected':'')+'>'+esc(s.name)+'</option>';}).join('');
    const toolbar='<div class="card no-print" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">'
      +(isSuper?'<label style="font-size:11px;color:var(--muted);">Workshop<select id="monthly-hs-site" style="display:block;margin-top:5px;min-width:220px;">'+siteOptions+'</select></label>':'')
      +'<label style="font-size:11px;color:var(--muted);">Month<input id="monthly-hs-month" type="month" value="'+esc(month)+'" max="'+esc(currentMonth())+'" style="display:block;margin-top:5px;"></label>'
      +'<button type="button" class="btn-sm" data-monthly-refresh>Refresh</button>'
      +'</div>';
    if(c.loading&&!c.loaded) return '<h2>Monthly H&S Checks</h2>'+toolbar+'<div class="card"><div class="empty-state">Loading monthly H&S checks…</div></div>';
    if(c.error) return '<h2>Monthly H&S Checks</h2>'+toolbar+'<div class="card" style="border-left:4px solid var(--red);">'+esc(c.error)+'</div>';
    const check=c.check||{};
    const published=check.status==='published';
    const statusBadge=published?'<span class="pill pill-approved">PUBLISHED · REV '+esc(check.revision||1)+'</span>':check.id?'<span class="pill pill-pending">DRAFT</span>':'<span class="pill pill-rejected">NOT STARTED</span>';
    const publishMeta=published?'<div style="font-size:12px;color:var(--muted);margin-top:5px;">Published '+esc(fmtDateTime(check.published_at))+(check.published_by_email?' by '+esc(check.published_by_email):'')+'. Editing and publishing changed content creates a new revision and requires staff to acknowledge again.</div>':'';
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><h2>Monthly H&S Checks</h2><div class="head-sub" style="margin-bottom:0;">Workshop monthly inspection and staff PIN acknowledgement.</div></div><button type="button" class="btn-sm" data-monthly-print '+(!check.id?'disabled':'')+'>🖶 Print report</button></div>'
      +toolbar
      +'<div class="card">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h3 style="font-size:19px;">'+esc(site.name)+' · '+esc(fmtMonth(month))+'</h3>'+publishMeta+'</div>'+statusBadge+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin:14px 0 8px;">Complete every item from the existing Monthly H&amp;S Template. Use Issue where action is required and add details in the notes column.</div>'
      +'<div style="overflow:auto;"><table style="min-width:760px;"><thead><tr><th>Check</th><th>Result</th><th>Notes</th></tr></thead><tbody>'+renderCheckRows(check)+'</tbody></table></div>'
      +'<div class="field" style="margin-top:16px;"><label>Manager notes / actions</label><textarea id="monthly-hs-manager-notes" rows="4" placeholder="Overall notes or actions for this month">'+esc(check.manager_notes||'')+'</textarea></div>'
      +'<div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;">'
      +(!published?'<button type="button" class="btn-sm" data-monthly-save>Save draft</button>':'')
      +'<button type="button" class="action-btn" data-monthly-publish style="max-width:340px;margin-top:0;">'+(published?'Publish update':'Publish for staff acknowledgement')+'</button>'
      +'</div></div>'
      +acknowledgementHtml(check,c.acks,sid,month);
  }

  function collectForm(){
    const checks={};
    const missing=[];
    CHECKS.forEach(function(item){
      const key=item[0],label=item[1];
      const sel=document.querySelector('[data-monthly-status="'+key+'"]');
      const note=document.querySelector('[data-monthly-note="'+key+'"]');
      const status=sel?String(sel.value||''):'';
      if(!status) missing.push(label);
      checks[key]={label:label,status:status,note:note?String(note.value||'').trim():''};
    });
    const notes=document.getElementById('monthly-hs-manager-notes');
    return {checks:checks,missing:missing,managerNotes:notes?String(notes.value||'').trim():''};
  }

  async function saveMonthly(publish){
    if(saving) return;
    const sid=selectedSiteId(), month=selectedMonth(), c=cacheFor(sid,month), form=collectForm();
    if(!sid||!isWorkshop(siteFor(sid))){showToast('Monthly H&S checks are only for workshop sites.',true);return;}
    if(publish&&form.missing.length){showToast('Complete every H&S item before publishing: '+form.missing.join(', ')+'.',true);return;}
    saving=true;
    try{
      const headers=await authHeaders(); headers['Content-Type']='application/json'; headers['Prefer']='resolution=merge-duplicates,return=representation';
      const payload={site_id:sid,month_start:monthStart(month),checks:form.checks,manager_notes:form.managerNotes,status:publish?'published':'draft'};
      const res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?on_conflict=site_id,month_start',{method:'POST',headers,body:JSON.stringify(payload)});
      if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('Save failed ('+res.status+')'));}
      c.loaded=false; kioskCache.delete(sid+'|'+currentMonth());
      await loadAdminRecord(sid,month,true);
      showToast(publish?'Monthly H&S checks published for staff acknowledgement.':'Monthly H&S draft saved.');
    }catch(err){showToast('Could not save Monthly H&S checks — '+(err&&err.message?err.message:'unknown error'),true);}
    finally{saving=false;}
  }

  function printMonthly(){
    const sid=selectedSiteId(), month=selectedMonth(), c=cacheFor(sid,month), check=c.check, site=siteFor(sid);
    if(!check||!site){showToast('Save the monthly H&S check before printing.',true);return;}
    const values=check.checks||{};
    const itemRows=CHECKS.map(function(item){const r=values[item[0]]||{};return '<tr><td><b>'+esc(item[1])+'</b></td><td style="font-weight:700;">'+esc(statusText(r.status))+'</td><td>'+esc(r.note||'')+'</td></tr>';}).join('');
    const staff=expectedStaffForDisplay(check,sid,month), byId=new Map((c.acks||[]).map(function(a){return [String(a.employee_id),a];}));
    const ackRows=staff.map(function(s){const a=byId.get(String(s.id));return '<tr><td><b>'+esc(s.name)+'</b></td><td>'+(a?'ACKNOWLEDGED':'OUTSTANDING')+'</td><td>'+(a?esc(fmtDateTime(a.acknowledged_at)):'—')+'</td></tr>';}).join('');
    const done=staff.filter(function(s){return byId.has(String(s.id));}).length;
    const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" style="max-width:180px;max-height:60px;">':'';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Monthly H&S Checks</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:12px}h1{font-size:21px;margin:0}h2{font-size:14px;margin:14px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;vertical-align:top}th{background:#eee;text-align:left}.meta{font-size:10px;margin-top:4px;color:#444}.notes{border:1px solid #999;padding:8px;min-height:34px}.footer{margin-top:12px;font-size:9px;color:#555}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
      +'<header><div><h1>Monthly H&amp;S Checks</h1><div class="meta"><b>'+esc(site.name)+'</b> · '+esc(fmtMonth(month))+' · '+esc(String(check.status||'').toUpperCase())+' · Revision '+esc(check.revision||1)+'</div><div class="meta">Published '+esc(fmtDateTime(check.published_at))+(check.published_by_email?' by '+esc(check.published_by_email):'')+'</div></div>'+logo+'</header>'
      +'<h2>Monthly inspection</h2><table><thead><tr><th>Check</th><th>Result</th><th>Notes / actions</th></tr></thead><tbody>'+itemRows+'</tbody></table>'
      +'<h2>Manager notes / actions</h2><div class="notes">'+esc(check.manager_notes||'—')+'</div>'
      +'<h2>Staff PIN acknowledgement · '+done+' / '+staff.length+'</h2><table><thead><tr><th>Employee</th><th>Status</th><th>Date / time</th></tr></thead><tbody>'+(ackRows||'<tr><td colspan="3">No staff were on the acknowledgement list when this revision was published.</td></tr>')+'</tbody></table>'
      +'<div class="footer">PINs are used only to verify the employee at acknowledgement time and are not printed or stored in this acknowledgement report. Printed '+esc(new Date().toLocaleString('en-GB'))+'.</div>'
      +'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>';
    const w=window.open('about:blank','_blank','width=950,height=850');
    if(!w){showToast('Allow pop-ups to print the Monthly H&S report.',true);return;}
    w.document.open();w.document.write(html);w.document.close();
  }

  function reminderHtml(){
    if(!state.admin||state.admin.role!=='site'||!isWorkshop(siteFor(state.admin.scopeSite))) return '';
    const sid=String(state.admin.scopeSite||''), c=cacheFor(sid,currentMonth());
    if(!c.loaded||c.loading||c.error) return '';
    if(c.check&&c.check.status==='published') return '';
    const msg=c.check&&c.check.status==='draft'?'A draft exists but has not been published for staff acknowledgement.':'This month has not been completed and published yet.';
    return '<div style="margin:0 0 16px;padding:13px 14px;border:1px solid var(--red);border-left:5px solid var(--red);background:var(--red-dim);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      +'<div><b style="display:block;color:var(--red);">Monthly H&S checks outstanding</b><span style="font-size:12px;color:var(--muted);">'+esc(fmtMonth(currentMonth()))+' · '+esc(msg)+'</span></div>'
      +'<button type="button" class="btn-sm reject" data-monthly-open>Complete now</button></div>';
  }

  async function loadKioskStatus(siteId,force){
    const key=String(siteId)+'|'+currentMonth();
    const cached=kioskCache.get(key);
    if(!force&&cached&&Date.now()-cached.loadedAt<60000) return cached;
    if(kioskLoading.has(key)) return cached||null;
    kioskLoading.add(key);
    try{
      const headers=await authHeaders(); headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/monthly_hs_kiosk_status',{method:'POST',headers,body:JSON.stringify({p_site_id:String(siteId)})});
      if(!res.ok) throw new Error('Monthly H&S status '+res.status);
      const data=await res.json(); data.loadedAt=Date.now(); kioskCache.set(key,data);
      try{if(typeof state!=='undefined'&&state.view==='home'&&typeof render==='function') render();}catch(_e){}
      return data;
    }catch(_e){ return null; }
    finally{kioskLoading.delete(key);}
  }

  function injectKioskTile(html){
    const sid=typeof getKioskSite==='function'?getKioskSite():'';
    if(!sid||!isWorkshop(siteFor(sid))) return html;
    const key=String(sid)+'|'+currentMonth(), st=kioskCache.get(key);
    setTimeout(function(){loadKioskStatus(sid,false);},0);
    if(!st||!st.published||Number(st.outstanding_count||0)<=0) return html;
    const wrap=document.createElement('div'); wrap.innerHTML=html;
    const actions=wrap.querySelector('.kiosk-actions');
    if(!actions) return html;
    const tile=document.createElement('div');
    tile.className='kiosk-btn'; tile.setAttribute('data-monthly-kiosk-open','');
    tile.style.borderColor='var(--red)';
    tile.innerHTML='<div class="icon" style="border-left-color:var(--red);">⚠</div><h2>Monthly H&amp;S</h2><p><b style="color:var(--red);">ACTION REQUIRED</b><br>'+esc(st.outstanding_count)+' staff acknowledgement'+(Number(st.outstanding_count)===1?'':'s')+' outstanding for '+esc(fmtMonth(st.month_start))+'. Enter your PIN to review and acknowledge.</p>';
    actions.appendChild(tile);
    return wrap.innerHTML;
  }

  function monthlyPinPad(){
    const keys=['1','2','3','4','5','6','7','8','9','clear','0','back'];
    return '<div class="pinpad">'+keys.map(function(k){
      if(k==='clear') return '<button type="button" class="pp-clear" data-monthly-pin-key="clear">Clear</button>';
      if(k==='back') return '<button type="button" class="pp-back" data-monthly-pin-key="back">⌫</button>';
      return '<button type="button" data-monthly-pin-key="'+k+'">'+k+'</button>';
    }).join('')+'</div>';
  }

  function showMonthlyPin(){
    kioskPin=''; kioskError=''; kioskRecord=null;
    const appEl=document.getElementById('app'); if(!appEl) return;
    appEl.innerHTML=(typeof topstrip==='function'?topstrip():'')+'<div class="flow"><div class="flow-card"><h2>Monthly H&amp;S</h2><div class="sub">Enter your PIN to review this month\'s checks</div><div class="pin-dots" data-monthly-pin-dots>'+Array.from({length:4},function(){return '<div class="pin-dot"></div>';}).join('')+'</div>'+monthlyPinPad()+'<div class="error-msg" data-monthly-pin-error></div><div class="back-link" data-monthly-kiosk-cancel>← Cancel</div></div></div>';
  }

  function refreshMonthlyPinUi(){
    const dots=document.querySelector('[data-monthly-pin-dots]');
    if(dots) dots.innerHTML=Array.from({length:4},function(_,i){return '<div class="pin-dot '+(i<kioskPin.length?'filled':'')+'"></div>';}).join('');
    const err=document.querySelector('[data-monthly-pin-error]'); if(err) err.textContent=kioskError||'';
  }

  async function openMonthlyForPin(){
    if(kioskBusy||kioskPin.length!==4) return;
    const sid=typeof getKioskSite==='function'?getKioskSite():'';
    kioskBusy=true; kioskError='Checking PIN…'; refreshMonthlyPinUi();
    try{
      const headers=await authHeaders(); headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/monthly_hs_for_pin',{method:'POST',headers,body:JSON.stringify({p_site_id:String(sid),p_pin:kioskPin})});
      if(!res.ok) throw new Error('Could not verify PIN.');
      const data=await res.json();
      if(!data||!data.ok){kioskError=(data&&data.message)||'PIN not recognised.';kioskPin='';refreshMonthlyPinUi();return;}
      kioskRecord=data; renderMonthlyReview();
    }catch(err){kioskError=err&&err.message?err.message:'Could not verify PIN.';kioskPin='';refreshMonthlyPinUi();}
    finally{kioskBusy=false;}
  }

  function renderMonthlyReview(){
    const r=kioskRecord||{}, values=r.checks||{};
    const rows=CHECKS.map(function(item){
      const v=values[item[0]]||{}, st=String(v.status||'');
      return '<div style="padding:11px 0;border-bottom:1px solid var(--line-soft);text-align:left;">'
        +'<div style="display:flex;justify-content:space-between;gap:12px;"><b>'+esc(item[1])+'</b><b style="color:'+statusColour(st)+';">'+esc(statusText(st))+'</b></div>'
        +(v.note?'<div style="font-size:12px;color:var(--muted);margin-top:4px;">'+esc(v.note)+'</div>':'')
        +'</div>';
    }).join('');
    const appEl=document.getElementById('app'); if(!appEl) return;
    const already=!!r.acked;
    appEl.innerHTML=(typeof topstrip==='function'?topstrip():'')+'<div class="flow" style="justify-content:flex-start;padding-top:28px;"><div class="flow-card" style="width:620px;max-width:94vw;">'
      +'<h2>Monthly H&amp;S · '+esc(fmtMonth(r.month_start))+'</h2><div class="sub">'+esc(r.employee_name||'')+' · Review every item before acknowledging.</div>'
      +'<div class="card" style="text-align:left;max-height:56vh;overflow:auto;">'+rows+(r.manager_notes?'<div style="margin-top:14px;padding:12px;border-left:4px solid var(--amber);background:var(--panel-2);"><b>Manager notes / actions</b><div style="font-size:12px;color:var(--muted);margin-top:5px;white-space:pre-wrap;">'+esc(r.manager_notes)+'</div></div>':'')+'</div>'
      +(already?'<div class="card" style="border-left:4px solid var(--green);text-align:left;"><b style="color:var(--green);">Already acknowledged</b><div style="font-size:12px;color:var(--muted);margin-top:4px;">Recorded '+esc(fmtDateTime(r.acknowledged_at))+'.</div></div><button type="button" class="action-btn" data-monthly-kiosk-done>Done</button>'
        :'<div style="text-align:left;font-size:12px;color:var(--muted);margin-top:12px;">By pressing acknowledge you confirm that you have read and understood the monthly H&amp;S checks and notes shown above. Your existing employee PIN verifies who acknowledged it; the PIN itself is not stored in the acknowledgement record.</div><button type="button" class="action-btn" data-monthly-ack>I have read and understood — acknowledge</button>')
      +'<div class="back-link" data-monthly-kiosk-cancel>← Cancel</div></div></div>';
  }

  async function acknowledgeMonthly(){
    if(kioskBusy||!kioskRecord||!kioskRecord.check_id) return;
    kioskBusy=true;
    try{
      const headers=await authHeaders(); headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/monthly_hs_acknowledge',{method:'POST',headers,body:JSON.stringify({p_check_id:kioskRecord.check_id,p_pin:kioskPin})});
      if(!res.ok) throw new Error('Could not save acknowledgement.');
      const data=await res.json();
      if(!data||!data.ok) throw new Error((data&&data.message)||'Could not save acknowledgement.');
      kioskRecord.acked=true; kioskRecord.acknowledged_at=data.acknowledged_at;
      const sid=typeof getKioskSite==='function'?getKioskSite():'';
      await loadKioskStatus(sid,true);
      const appEl=document.getElementById('app'); if(!appEl) return;
      appEl.innerHTML=(typeof topstrip==='function'?topstrip():'')+'<div class="flow"><div class="flow-card"><div class="big-check">✓</div><h2>Monthly H&amp;S acknowledged</h2><div class="sub">Thanks, '+esc(data.employee_name||kioskRecord.employee_name||'')+'. Recorded '+esc(fmtDateTime(data.acknowledged_at))+'.</div><button type="button" class="action-btn" data-monthly-kiosk-done>Done</button></div></div>';
    }catch(err){showToast(err&&err.message?err.message:'Could not save acknowledgement.',true);}
    finally{kioskBusy=false;}
  }

  try{
    if(typeof ADMIN_TAB_OPTIONS!=='undefined'&&!ADMIN_TAB_OPTIONS.some(function(row){return row[0]===TAB_KEY;})){
      const at=ADMIN_TAB_OPTIONS.findIndex(function(row){return row[0]==='weeklychecks';});
      ADMIN_TAB_OPTIONS.splice(at>=0?at+1:ADMIN_TAB_OPTIONS.length,0,[TAB_KEY,'Monthly H&S','Management']);
    }
    if(typeof SITE_BASE_TABS!=='undefined'&&SITE_BASE_TABS&&typeof SITE_BASE_TABS.add==='function') SITE_BASE_TABS.add(TAB_KEY);
    if(typeof state!=='undefined'&&state.admin){
      if(state.admin.monthlyHsSite===undefined) state.admin.monthlyHsSite='';
      if(state.admin.monthlyHsMonth===undefined) state.admin.monthlyHsMonth=currentMonth();
    }
    if(typeof canAccessAdminTab==='function'){
      const oldAccess=canAccessAdminTab;
      canAccessAdminTab=function(key){
        if(key===TAB_KEY&&state.admin&&state.admin.role==='site'&&!isWorkshop(siteFor(state.admin.scopeSite))) return false;
        return oldAccess(key);
      };
    }
    if(typeof renderAdmin==='function'){
      const oldRenderAdmin=renderAdmin;
      renderAdmin=function(){
        ensureAdminLoaded();
        const html=oldRenderAdmin();
        const wrap=document.createElement('div'); wrap.innerHTML=html;
        const main=wrap.querySelector('.admin-main');
        if(!main) return html;
        if(state.admin&&state.admin.tab===TAB_KEY){
          const top=main.querySelector('.admin-topbar');
          main.innerHTML=(top?top.outerHTML:'')+renderMonthlyAdmin();
        }else{
          const top=main.querySelector('.admin-topbar'), reminder=reminderHtml();
          if(top&&reminder) top.insertAdjacentHTML('afterend',reminder);
        }
        return wrap.innerHTML;
      };
    }
    if(typeof renderHome==='function'){
      const oldRenderHome=renderHome;
      renderHome=function(){return injectKioskTile(oldRenderHome());};
    }
  }catch(err){console.error('Monthly H&S patch failed:',err);}

  document.addEventListener('change',function(e){
    const t=e.target;
    if(!t) return;
    if(t.id==='monthly-hs-site'){
      state.admin.monthlyHsSite=t.value||''; if(typeof render==='function') render();
    }else if(t.id==='monthly-hs-month'){
      state.admin.monthlyHsMonth=t.value||currentMonth(); if(typeof render==='function') render();
    }
  },true);

  document.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('[data-monthly-open],[data-monthly-save],[data-monthly-publish],[data-monthly-print],[data-monthly-refresh],[data-monthly-kiosk-open],[data-monthly-pin-key],[data-monthly-kiosk-cancel],[data-monthly-kiosk-done],[data-monthly-ack]'):null;
    if(!t) return;
    if(t.hasAttribute('data-monthly-open')){
      e.preventDefault(); state.admin.tab=TAB_KEY; state.admin.monthlyHsMonth=currentMonth(); if(typeof render==='function') render(); return;
    }
    if(t.hasAttribute('data-monthly-save')){e.preventDefault();saveMonthly(false);return;}
    if(t.hasAttribute('data-monthly-publish')){e.preventDefault();saveMonthly(true);return;}
    if(t.hasAttribute('data-monthly-print')){e.preventDefault();printMonthly();return;}
    if(t.hasAttribute('data-monthly-refresh')){
      e.preventDefault(); const c=cacheFor(selectedSiteId(),selectedMonth()); c.loaded=false; loadAdminRecord(selectedSiteId(),selectedMonth(),true); return;
    }
    if(t.hasAttribute('data-monthly-kiosk-open')){e.preventDefault();e.stopPropagation();showMonthlyPin();return;}
    if(t.hasAttribute('data-monthly-pin-key')){
      e.preventDefault();
      const k=t.getAttribute('data-monthly-pin-key');
      if(k==='clear') kioskPin=''; else if(k==='back') kioskPin=kioskPin.slice(0,-1); else if(/^\d$/.test(k)&&kioskPin.length<4) kioskPin+=k;
      kioskError=''; refreshMonthlyPinUi();
      if(kioskPin.length===4) setTimeout(openMonthlyForPin,80);
      return;
    }
    if(t.hasAttribute('data-monthly-ack')){e.preventDefault();acknowledgeMonthly();return;}
    if(t.hasAttribute('data-monthly-kiosk-cancel')||t.hasAttribute('data-monthly-kiosk-done')){
      e.preventDefault(); kioskPin='';kioskError='';kioskRecord=null;if(typeof render==='function') render();return;
    }
  },true);
})();
