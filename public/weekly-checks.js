(function(){
  'use strict';

  const TAB_KEY='weeklychecks';
  const BUCKET='weekly-checks';
  const MAX_FILE_BYTES=20*1024*1024;
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp','csv','xls','xlsx']);
  let weekRows=[];
  let loadedWeek='';
  let loading=false;
  let loadError='';
  let historyRows=[];
  let historySite='';
  let historyLoading=false;
  let saving=false;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function isoLocal(d){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function mondayFor(d){
    const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const diff=(x.getDay()+6)%7;
    x.setDate(x.getDate()-diff);
    return x;
  }
  function currentWeekStart(){ return isoLocal(mondayFor(new Date())); }
  function addDays(isoDate,n){
    const d=new Date(isoDate+'T12:00:00'); d.setDate(d.getDate()+n); return isoLocal(d);
  }
  function fmtDate(isoDate){
    const d=new Date(isoDate+'T12:00:00');
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  }
  function fmtShort(isoDate){
    const d=new Date(isoDate+'T12:00:00');
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  }
  function fmtDateTime(v){
    if(!v) return '';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function sites(){
    return (state.config && state.config.sites ? state.config.sites : []).slice().sort(function(a,b){
      return String(a.name||'').localeCompare(String(b.name||''));
    });
  }
  function siteFor(id){ return sites().find(function(s){ return String(s.id)===String(id); }); }
  function selectedSiteId(){
    if(state.admin.role!=='super') return String(state.admin.scopeSite||'');
    const wanted=String(state.admin.weeklySite||'');
    if(wanted && siteFor(wanted)) return wanted;
    const first=sites()[0];
    if(first){ state.admin.weeklySite=String(first.id); return String(first.id); }
    return '';
  }
  function recordFor(siteId){
    const wk=currentWeekStart();
    return weekRows.find(function(r){ return String(r.site_id)===String(siteId) && String(r.week_start)===wk; })||null;
  }
  function cleanName(name){ return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file'; }
  function storagePath(path){ return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/'); }
  function fileExt(name){ const p=String(name||'').toLowerCase().split('.'); return p.length>1?p.pop():''; }
  function mimeFor(file){
    if(file.type) return file.type;
    const ext=fileExt(file.name);
    if(ext==='pdf') return 'application/pdf';
    if(ext==='jpg'||ext==='jpeg') return 'image/jpeg';
    if(ext==='png') return 'image/png';
    if(ext==='webp') return 'image/webp';
    if(ext==='csv') return 'text/csv';
    if(ext==='xls') return 'application/vnd.ms-excel';
    if(ext==='xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }

  async function loadCurrent(force){
    const wk=currentWeekStart();
    if(!state.admin || !state.admin.authed) return;
    if(!force && (loading || loadedWeek===wk)) return;
    loading=true; loadError='';
    try{
      const headers=await authHeaders();
      const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&week_start=eq.'+encodeURIComponent(wk)+'&order=site_id.asc';
      const res=await fetch(url,{headers,cache:'no-store'});
      if(!res.ok) throw new Error('Weekly checks '+res.status);
      weekRows=await res.json();
      loadedWeek=wk;
    }catch(err){
      loadError=err&&err.message?err.message:'Could not load weekly checks';
      weekRows=[];
      loadedWeek=wk;
    }finally{
      loading=false;
      try{ if(state.admin && state.admin.authed && typeof render==='function') render(); }catch(_e){}
    }
  }

  async function loadHistory(siteId,force){
    if(!siteId || historyLoading) return;
    if(!force && historySite===String(siteId)) return;
    historyLoading=true;
    try{
      const headers=await authHeaders();
      const from=addDays(currentWeekStart(),-84);
      const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&week_start=gte.'+encodeURIComponent(from)+'&order=week_start.desc&limit=12';
      const res=await fetch(url,{headers,cache:'no-store'});
      if(!res.ok) throw new Error('History '+res.status);
      historyRows=await res.json();
      historySite=String(siteId);
    }catch(_e){
      historyRows=[]; historySite=String(siteId);
    }finally{
      historyLoading=false;
      try{ if(state.admin && state.admin.tab===TAB_KEY && typeof render==='function') render(); }catch(_e){}
    }
  }

  function ensureLoaded(){
    if(!state.admin || !state.admin.authed) return;
    const wk=currentWeekStart();
    if(loadedWeek!==wk && !loading) setTimeout(function(){ loadCurrent(false); },0);
    if(state.admin.tab===TAB_KEY){
      const sid=selectedSiteId();
      if(sid && historySite!==sid && !historyLoading) setTimeout(function(){ loadHistory(sid,false); },0);
    }
  }

  function checkboxRow(id,label,checked,detail){
    return '<label style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line-soft);cursor:pointer;">'
      +'<input id="'+id+'" type="checkbox" '+(checked?'checked':'')+' style="width:20px;height:20px;margin-top:1px;accent-color:var(--green);">'
      +'<span><b style="display:block;font-size:14px;">'+esc(label)+'</b>'
      +(detail?'<span style="display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.4;">'+esc(detail)+'</span>':'')
      +'</span></label>';
  }

  function filesHtml(files){
    const arr=Array.isArray(files)?files:[];
    if(!arr.length) return '<div style="color:var(--muted-2);font-size:12px;margin-top:8px;">No stock sheet uploaded yet.</div>';
    return '<div style="display:flex;flex-direction:column;gap:7px;margin-top:9px;">'+arr.map(function(f){
      return '<button type="button" class="btn-sm" data-weekly-file="'+esc(f.path||'')+'" data-weekly-name="'+esc(f.name||'Stock sheet')+'" style="text-align:left;width:max-content;max-width:100%;overflow:hidden;text-overflow:ellipsis;">📎 '+esc(f.name||'Stock sheet')+'</button>';
    }).join('')+'</div>';
  }

  function formFor(siteId){
    const site=siteFor(siteId);
    if(!site) return '<div class="card">No site selected.</div>';
    const rec=recordFor(siteId)||{};
    const stockFiles=Array.isArray(rec.stock_files)?rec.stock_files:[];
    const done=!!rec.id;
    return '<div class="card" style="margin-top:14px;">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      +'<div><h3 style="font-size:19px;">'+esc(site.name)+'</h3><div style="color:var(--muted);font-size:12px;margin-top:4px;">Week commencing '+esc(fmtDate(currentWeekStart()))+' · through '+esc(fmtDate(addDays(currentWeekStart(),6)))+'</div></div>'
      +'<span class="pill '+(done?'pill-approved':'pill-rejected')+'">'+(done?'SUBMITTED':'NOT DONE')+'</span></div>'
      +(done?'<div style="margin-top:10px;color:var(--muted);font-size:12px;">Submitted '+esc(fmtDateTime(rec.submitted_at))+(rec.submitted_by_email?' by '+esc(rec.submitted_by_email):'')+'. You can update and resubmit if something changes.</div>':'<div style="margin-top:10px;color:var(--red);font-size:12px;font-weight:700;">This week is still outstanding.</div>')
      +'<form id="weekly-check-form" data-site-id="'+esc(siteId)+'" style="margin-top:16px;">'
      +checkboxRow('wc-timesheet','Weekly time sheet completed',!!rec.weekly_timesheet_done,'Confirm the weekly time sheet has been completed.')
      +checkboxRow('wc-car','Car cleaning sheet completed',!!rec.car_cleaning_done,'Confirm the car cleaning check has been completed.')
      +checkboxRow('wc-site','Site cleaning sheet completed',!!rec.site_cleaning_done,'Confirm the site cleaning check has been completed.')
      +checkboxRow('wc-oxy','Oxy/acetylene checks completed',!!rec.oxy_acetylene_done,'Confirm the weekly gas equipment checks have been completed.')
      +'<div style="padding:14px 0;border-bottom:1px solid var(--line-soft);"><div style="font-weight:700;font-size:14px;">Stock take sheet <span style="color:var(--red);">required</span></div><div style="color:var(--muted);font-size:12px;margin-top:3px;">Upload the completed stock sheet. PDF, photo, CSV or Excel, up to 20 MB each.</div><input id="wc-stock-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx" style="margin-top:10px;max-width:100%;">'+filesHtml(stockFiles)+'</div>'
      +'<div class="form-row" style="margin-top:16px;">'
      +'<div class="field"><label>Flag condition</label><select id="wc-flag"><option value="ok" '+(rec.flag_status!=='issue'?'selected':'')+'>OK</option><option value="issue" '+(rec.flag_status==='issue'?'selected':'')+'>Issue</option></select></div>'
      +'<div class="field"><label>MOT test log</label><select id="wc-mot"><option value="up_to_date" '+(rec.mot_log_status!=='issue'?'selected':'')+'>Up to date</option><option value="issue" '+(rec.mot_log_status==='issue'?'selected':'')+'>Issue</option></select></div>'
      +'</div>'
      +'<div class="field"><label>Site maintenance issues</label><input id="wc-maint" value="'+esc(rec.maintenance_status||'OK')+'" placeholder="OK or enter issue details"></div>'
      +'<div class="field"><label>Vehicles left on site</label><input id="wc-vehicles" value="'+esc(rec.vehicles_left_status||'No vehicles left on site')+'" placeholder="No vehicles left on site or add details"></div>'
      +'<div class="field"><label>Alarm call-out</label><input id="wc-alarm" value="'+esc(rec.alarm_callout_status||'Not required')+'" placeholder="Not required or add details"></div>'
      +'<div class="field"><label>Notes / issues for senior management</label><textarea id="wc-notes" rows="3" placeholder="Optional">'+esc(rec.notes||'')+'</textarea></div>'
      +'<button type="button" class="action-btn" data-weekly-submit style="max-width:360px;">'+(done?'Update weekly checks':'Submit weekly checks')+'</button>'
      +'</form></div>';
  }

  function summaryForSuper(){
    const all=sites();
    let done=0;
    const rows=all.map(function(site){
      const r=recordFor(site.id);
      if(r) done++;
      return '<tr><td><b>'+esc(site.name)+'</b></td><td><span class="pill '+(r?'pill-approved':'pill-rejected')+'">'+(r?'Done':'Not done')+'</span></td><td>'+(r?esc(fmtDateTime(r.submitted_at)):'—')+'</td><td>'+(r?esc(r.submitted_by_email||''):'—')+'</td><td><button type="button" class="btn-sm" data-weekly-site="'+esc(site.id)+'">Review</button></td></tr>';
    }).join('');
    return '<div class="card"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;"><div><h3 style="font-size:18px;">All-sites weekly status</h3><div style="color:var(--muted);font-size:12px;margin-top:3px;">Week commencing '+esc(fmtDate(currentWeekStart()))+'</div></div><div style="font-size:13px;"><b>'+done+'</b> of <b>'+all.length+'</b> completed</div></div>'
      +'<div style="overflow:auto;"><table><thead><tr><th>Site</th><th>Status</th><th>Submitted</th><th>Manager</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  }

  function historyHtml(siteId){
    if(historyLoading && historySite!==String(siteId)) return '<div class="card"><div class="empty-state">Loading recent weekly checks…</div></div>';
    const rows=historyRows.filter(function(r){ return String(r.site_id)===String(siteId); }).slice(0,8);
    if(!rows.length) return '';
    return '<div class="card" style="margin-top:14px;"><h3 style="font-size:17px;margin-bottom:10px;">Recent submissions</h3><div style="overflow:auto;"><table><thead><tr><th>Week commencing</th><th>Submitted</th><th>By</th><th>Stock sheet</th></tr></thead><tbody>'
      +rows.map(function(r){
        const files=Array.isArray(r.stock_files)?r.stock_files:[];
        const f=files[0];
        return '<tr><td>'+esc(fmtShort(r.week_start))+'</td><td>'+esc(fmtDateTime(r.submitted_at))+'</td><td>'+esc(r.submitted_by_email||'—')+'</td><td>'+(f?'<button type="button" class="btn-sm" data-weekly-file="'+esc(f.path||'')+'" data-weekly-name="'+esc(f.name||'Stock sheet')+'">Open</button>':'—')+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  }

  function renderWeekly(){
    ensureLoaded();
    if(loading && !loadedWeek) return '<h2>Weekly Checks</h2><div class="card"><div class="empty-state">Loading weekly checks…</div></div>';
    if(loadError) return '<h2>Weekly Checks</h2><div class="card" style="border-left:4px solid var(--red);">Could not load weekly checks: '+esc(loadError)+'</div>';
    const sid=selectedSiteId();
    const isSuper=state.admin.role==='super';
    const options=sites().map(function(s){ return '<option value="'+esc(s.id)+'" '+(String(s.id)===sid?'selected':'')+'>'+esc(s.name)+'</option>'; }).join('');
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><h2>Weekly Checks</h2><div class="head-sub" style="margin-bottom:0;">Every site manager must complete these once each week. Outstanding checks stay flagged until submitted.</div></div><button type="button" class="btn-sm" data-weekly-refresh>Refresh</button></div>'
      +(isSuper?'<div style="margin:16px 0;" class="cal-toolbar"><label style="font-size:12px;color:var(--muted);">Site to review</label><select id="weekly-site-select">'+options+'</select></div>':'')
      +(isSuper?summaryForSuper():'')
      +formFor(sid)
      +historyHtml(sid);
  }

  function reminderHtml(){
    if(state.admin.role!=='site' || loading || loadError || loadedWeek!==currentWeekStart()) return '';
    const sid=String(state.admin.scopeSite||'');
    if(!sid || recordFor(sid)) return '';
    return '<div style="margin:0 0 16px;padding:13px 14px;border:1px solid var(--red);border-left:5px solid var(--red);background:var(--red-dim);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      +'<div><b style="display:block;color:var(--red);">Weekly checks not completed</b><span style="font-size:12px;color:var(--muted);">Week commencing '+esc(fmtDate(currentWeekStart()))+'. This reminder will stay here until the checks are submitted.</span></div>'
      +'<button type="button" class="btn-sm reject" data-weekly-open>Complete now</button></div>';
  }

  async function uploadStockFile(siteId,weekStart,file){
    const ext=fileExt(file.name);
    if(!ALLOWED_EXT.has(ext)) throw new Error('Stock sheets must be PDF, image, CSV or Excel files.');
    if(file.size>MAX_FILE_BYTES) throw new Error('Each stock sheet must be 20 MB or smaller.');
    const path=siteId+'/'+weekStart+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders();
    headers['Content-Type']=mimeFor(file);
    headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers,body:file});
    if(!res.ok){ const text=await res.text().catch(function(){return '';}); throw new Error('Stock sheet upload failed'+(text?': '+text.slice(0,140):'')); }
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,uploadedAt:new Date().toISOString()};
  }

  async function openStockFile(path,name){
    if(!path) return;
    const headers=await authHeaders(); delete headers['Content-Type'];
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/authenticated/'+BUCKET+'/'+storagePath(path),{headers});
    if(!res.ok){ showToast('Could not open stock sheet ('+res.status+').',true); return; }
    const blob=await res.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; a.download=name||'stock-sheet'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },60000);
  }

  async function submitWeekly(){
    if(saving) return;
    const form=document.getElementById('weekly-check-form');
    if(!form) return;
    const siteId=String(form.dataset.siteId||'');
    if(!siteId) return;
    const required=[['wc-timesheet','weekly time sheet'],['wc-car','car cleaning sheet'],['wc-site','site cleaning sheet'],['wc-oxy','oxy/acetylene checks']];
    const missing=required.filter(function(row){ const el=document.getElementById(row[0]); return !el || !el.checked; }).map(function(row){return row[1];});
    if(missing.length){ showToast('Complete these checks first: '+missing.join(', ')+'.',true); return; }
    const rec=recordFor(siteId)||{};
    let stockFiles=Array.isArray(rec.stock_files)?rec.stock_files.slice():[];
    const input=document.getElementById('wc-stock-files');
    const chosen=input&&input.files?Array.from(input.files):[];
    if(!stockFiles.length && !chosen.length){ showToast('Upload the completed stock take sheet before submitting.',true); return; }
    saving=true;
    const btn=document.querySelector('[data-weekly-submit]'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
    try{
      for(const file of chosen) stockFiles.push(await uploadStockFile(siteId,currentWeekStart(),file));
      const payload={
        site_id:siteId,
        week_start:currentWeekStart(),
        weekly_timesheet_done:true,
        car_cleaning_done:true,
        site_cleaning_done:true,
        stock_take_done:true,
        flag_status:(document.getElementById('wc-flag')||{}).value||'ok',
        oxy_acetylene_done:true,
        mot_log_status:(document.getElementById('wc-mot')||{}).value||'up_to_date',
        maintenance_status:String((document.getElementById('wc-maint')||{}).value||'OK').trim()||'OK',
        vehicles_left_status:String((document.getElementById('wc-vehicles')||{}).value||'No vehicles left on site').trim()||'No vehicles left on site',
        alarm_callout_status:String((document.getElementById('wc-alarm')||{}).value||'Not required').trim()||'Not required',
        notes:String((document.getElementById('wc-notes')||{}).value||'').trim(),
        stock_files:stockFiles
      };
      const headers=await authHeaders();
      headers['Content-Type']='application/json';
      headers['Prefer']='resolution=merge-duplicates,return=representation';
      const res=await fetch(SUPABASE_URL+'/rest/v1/weekly_site_checks?on_conflict=site_id,week_start',{method:'POST',headers,body:JSON.stringify(payload)});
      if(!res.ok){ const text=await res.text().catch(function(){return '';}); throw new Error(text||('Save failed ('+res.status+')')); }
      await loadCurrent(true);
      historySite='';
      await loadHistory(siteId,true);
      showToast('Weekly checks submitted.');
    }catch(err){
      showToast('Could not save weekly checks — '+(err&&err.message?err.message:'unknown error'),true);
    }finally{
      saving=false;
      if(typeof render==='function') render();
    }
  }

  try{
    if(typeof ADMIN_TAB_OPTIONS!=='undefined' && !ADMIN_TAB_OPTIONS.some(function(row){ return row[0]===TAB_KEY; })){
      const at=ADMIN_TAB_OPTIONS.findIndex(function(row){ return row[0]==='contacts'; });
      ADMIN_TAB_OPTIONS.splice(at>=0?at:ADMIN_TAB_OPTIONS.length,0,[TAB_KEY,'Weekly Checks','Management']);
    }
    if(typeof SITE_BASE_TABS!=='undefined' && SITE_BASE_TABS && typeof SITE_BASE_TABS.add==='function') SITE_BASE_TABS.add(TAB_KEY);
    if(typeof state!=='undefined' && state.admin && state.admin.weeklySite===undefined) state.admin.weeklySite='';

    const originalRenderAdmin=renderAdmin;
    renderAdmin=function(){
      ensureLoaded();
      const html=originalRenderAdmin();
      const wrap=document.createElement('div'); wrap.innerHTML=html;
      const main=wrap.querySelector('.admin-main');
      if(!main) return html;
      if(state.admin && state.admin.tab===TAB_KEY){
        const top=main.querySelector('.admin-topbar');
        main.innerHTML=(top?top.outerHTML:'')+renderWeekly();
      }else{
        const top=main.querySelector('.admin-topbar');
        const reminder=reminderHtml();
        if(top && reminder) top.insertAdjacentHTML('afterend',reminder);
      }
      return wrap.innerHTML;
    };
  }catch(err){
    console.error('Weekly checks setup failed:',err);
  }

  document.addEventListener('change',function(e){
    if(!e.target || e.target.id!=='weekly-site-select') return;
    state.admin.weeklySite=e.target.value||'';
    historySite='';
    if(typeof render==='function') render();
  },true);

  document.addEventListener('click',function(e){
    const el=e.target&&e.target.closest?e.target.closest('[data-weekly-open],[data-weekly-site],[data-weekly-submit],[data-weekly-file],[data-weekly-refresh]'):null;
    if(!el) return;
    if(el.hasAttribute('data-weekly-open')){
      e.preventDefault(); state.admin.tab=TAB_KEY; if(typeof render==='function') render(); return;
    }
    if(el.hasAttribute('data-weekly-site')){
      e.preventDefault(); state.admin.weeklySite=el.getAttribute('data-weekly-site')||''; historySite=''; if(typeof render==='function') render(); return;
    }
    if(el.hasAttribute('data-weekly-submit')){
      e.preventDefault(); submitWeekly(); return;
    }
    if(el.hasAttribute('data-weekly-file')){
      e.preventDefault(); openStockFile(el.getAttribute('data-weekly-file'),el.getAttribute('data-weekly-name')||'stock-sheet'); return;
    }
    if(el.hasAttribute('data-weekly-refresh')){
      e.preventDefault(); loadedWeek=''; historySite=''; loadCurrent(true); return;
    }
  },true);

  setInterval(function(){
    try{
      if(state.admin && state.admin.authed && loadedWeek!==currentWeekStart()){ loadedWeek=''; historySite=''; loadCurrent(true); }
    }catch(_e){}
  },300000);

  setTimeout(function(){ try{ ensureLoaded(); }catch(_e){} },0);
})();
