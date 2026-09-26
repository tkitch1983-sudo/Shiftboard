(function(){
  'use strict';

  const TAB_KEY='monthlyhs';
  const BUCKET='monthly-hs';
  const MAX_FILE_BYTES=20*1024*1024;
  const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','webp']);
  const cache=new Map();
  const loading=new Set();
  let saving=false;
  let kioskRecord=null;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function currentMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function monthStart(v){return String(v||currentMonth()).slice(0,7)+'-01';}
  function fmtMonth(v){const m=String(v||currentMonth()).slice(0,7),d=new Date(m+'-01T12:00:00');return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
  function fmtDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  function fileExt(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
  function cleanName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
  function storagePath(path){return String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');}
  function mimeFor(file){if(file.type)return file.type;const e=fileExt(file.name);if(e==='pdf')return 'application/pdf';if(e==='jpg'||e==='jpeg')return 'image/jpeg';if(e==='png')return 'image/png';if(e==='webp')return 'image/webp';return 'application/octet-stream';}
  function siteFor(id){const st=typeof state!=='undefined'?state:{};return (((st.config||{}).sites)||[]).find(function(s){return String(s.id)===String(id);});}
  function siteId(){if(!state||!state.admin)return '';if(state.admin.role==='site')return String(state.admin.scopeSite||'');return String(state.admin.monthlyHsSite||'');}
  function selectedMonth(){return String((state&&state.admin&&state.admin.monthlyHsMonth)||currentMonth()).slice(0,7);}
  function keyFor(sid,month){return String(sid)+'|'+String(month).slice(0,7);}
  function recordFor(sid,month){return cache.get(keyFor(sid,month))||null;}

  async function loadRecord(sid,month,force){
    if(!sid)return null;
    const key=keyFor(sid,month);
    if(loading.has(key))return recordFor(sid,month);
    if(!force&&cache.has(key))return cache.get(key);
    loading.add(key);
    try{
      const headers=await authHeaders();
      const res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&site_id=eq.'+encodeURIComponent(sid)+'&month_start=eq.'+encodeURIComponent(monthStart(month))+'&limit=1',{headers,cache:'no-store'});
      if(!res.ok)throw new Error('MOT QC monthly record '+res.status);
      const rows=await res.json(),rec=rows[0]||null;
      cache.set(key,rec);
      return rec;
    }catch(_e){return recordFor(sid,month);}finally{loading.delete(key);}
  }

  function scheduleLoad(){
    if(!state||!state.admin||state.admin.tab!==TAB_KEY)return;
    const sid=siteId(),month=selectedMonth(),key=keyFor(sid,month);
    if(!sid||loading.has(key)||cache.has(key))return;
    setTimeout(function(){loadRecord(sid,month,false).then(function(){try{if(state.admin&&state.admin.tab===TAB_KEY)render();}catch(_e){}});},0);
  }

  function qcFiles(rec){return Array.isArray(rec&&rec.mot_qc_files)?rec.mot_qc_files:[];}
  function qcRow(rec){
    const row=((rec&&rec.checks)||{}).mot_qc||{},st=String(row.status||'');
    return '<tr data-monthly-mot-qc-row>'
      +'<td style="font-weight:700;white-space:nowrap;">MOT QC</td>'
      +'<td style="width:170px;"><select data-monthly-status="mot_qc" style="width:100%;padding:9px;">'
      +'<option value="" '+(!st?'selected':'')+'>Select…</option>'
      +'<option value="ok" '+(st==='ok'?'selected':'')+'>OK</option>'
      +'<option value="issue" '+(st==='issue'?'selected':'')+'>Issue</option>'
      +'</select></td>'
      +'<td><input data-monthly-note="mot_qc" value="'+esc(row.note||'')+'" placeholder="QC result / actions required" style="width:100%;min-width:210px;padding:9px;"></td>'
      +'</tr>';
  }

  function fileListHtml(rec){
    const files=qcFiles(rec);
    if(!files.length)return '<div style="font-size:12px;color:var(--red);margin-top:7px;"><b>No MOT QC copy uploaded yet.</b> A copy is required before publishing.</div>';
    return '<div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap;">'+files.map(function(f,i){return '<button type="button" class="btn-sm" data-monthly-mot-file="'+i+'">📎 '+esc(f.name||('MOT QC copy '+(i+1)))+'</button>';}).join('')+'</div>';
  }

  function uploadHtml(rec){
    return '<div data-monthly-mot-qc-upload style="margin-top:14px;padding:13px;border:1px solid var(--line-soft);border-left:4px solid var(--red);border-radius:10px;">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;"><div><b>MOT QC copy</b><div style="font-size:12px;color:var(--muted);margin-top:3px;">Complete the monthly MOT QC above and upload the completed copy. PDF or image, up to 20 MB.</div></div><span class="pill '+(qcFiles(rec).length?'pill-approved':'pill-rejected')+'">'+(qcFiles(rec).length?'COPY UPLOADED':'COPY REQUIRED')+'</span></div>'
      +fileListHtml(rec)
      +'<label class="no-print" style="display:block;margin-top:10px;font-size:12px;font-weight:700;">Upload completed MOT QC copy<input id="monthly-mot-qc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" style="display:block;margin-top:6px;"></label>'
      +'</div>';
  }

  function patchAdminHtml(html){
    if(!state||!state.admin||state.admin.tab!==TAB_KEY)return html;
    scheduleLoad();
    const sid=siteId(),month=selectedMonth(),rec=recordFor(sid,month);
    const wrap=document.createElement('div');wrap.innerHTML=html;
    const main=wrap.querySelector('.admin-main');if(!main)return html;
    const table=main.querySelector('[data-monthly-status]')&&main.querySelector('[data-monthly-status]').closest('table');
    if(table&&!table.querySelector('[data-monthly-mot-qc-row]')){
      const body=table.querySelector('tbody');if(body)body.insertAdjacentHTML('beforeend',qcRow(rec));
    }
    if(!main.querySelector('[data-monthly-mot-qc-upload]')){
      const notes=main.querySelector('#monthly-hs-manager-notes');
      const field=notes&&notes.closest('.field');
      if(field)field.insertAdjacentHTML('beforebegin',uploadHtml(rec));
    }
    return wrap.innerHTML;
  }

  function collectExistingChecks(){
    const checks={};
    document.querySelectorAll('[data-monthly-status]').forEach(function(sel){
      const key=String(sel.getAttribute('data-monthly-status')||'');if(!key)return;
      const note=document.querySelector('[data-monthly-note="'+key+'"]');
      let label=key==='mot_qc'?'MOT QC':key;
      const tr=sel.closest('tr'),td=tr&&tr.querySelector('td');if(td&&td.textContent.trim())label=td.textContent.trim();
      checks[key]={label:label,status:String(sel.value||''),note:note?String(note.value||'').trim():''};
    });
    return checks;
  }

  function missingChecks(checks){
    return Object.keys(checks).filter(function(k){return !checks[k].status;}).map(function(k){return checks[k].label||k;});
  }

  function chosenFile(){
    const input=document.getElementById('monthly-mot-qc-file');return input&&input.files&&input.files[0]?input.files[0]:null;
  }

  async function uploadQc(sid,month,file){
    const ext=fileExt(file.name);
    if(!ALLOWED_EXT.has(ext))throw new Error('MOT QC copy must be PDF, JPG, PNG or WebP.');
    if(file.size>MAX_FILE_BYTES)throw new Error('MOT QC copy must be 20 MB or smaller.');
    const path=sid+'/'+monthStart(month)+'/mot-qc/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+cleanName(file.name);
    const headers=await authHeaders();headers['Content-Type']=mimeFor(file);headers['x-upsert']='false';
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/'+storagePath(path),{method:'POST',headers,body:file});
    if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('MOT QC upload failed ('+res.status+')'));}
    return {path:path,name:file.name,type:mimeFor(file),size:file.size,category:'mot_qc',uploadedAt:new Date().toISOString()};
  }

  async function saveExtended(publish){
    if(saving)return;
    const sid=siteId(),month=selectedMonth();
    if(!sid){showToast('Select a workshop first.',true);return;}
    const checks=collectExistingChecks(),missing=missingChecks(checks),qc=checks.mot_qc||{};
    if(publish&&missing.length){showToast('Complete every monthly item before publishing: '+missing.join(', ')+'.',true);return;}
    if(publish&&qc.status!=='ok'&&qc.status!=='issue'){showToast('Complete the MOT QC before publishing.',true);return;}
    saving=true;
    const btn=document.querySelector('[data-monthly-publish]');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{
      const existing=await loadRecord(sid,month,true)||{};
      let files=qcFiles(existing).slice(),file=chosenFile();
      if(file)files.push(await uploadQc(sid,month,file));
      if(publish&&!files.length)throw new Error('Upload the completed MOT QC copy before publishing.');
      const notes=document.getElementById('monthly-hs-manager-notes');
      const headers=await authHeaders();headers['Content-Type']='application/json';headers['Prefer']='resolution=merge-duplicates,return=representation';
      const payload={site_id:sid,month_start:monthStart(month),checks:checks,manager_notes:notes?String(notes.value||'').trim():'',mot_qc_files:files,status:publish?'published':'draft'};
      const res=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?on_conflict=site_id,month_start',{method:'POST',headers,body:JSON.stringify(payload)});
      if(!res.ok){const text=await res.text().catch(function(){return '';});throw new Error(text||('Save failed ('+res.status+')'));}
      cache.delete(keyFor(sid,month));
      await loadRecord(sid,month,true);
      showToast(publish?'Monthly H&S checks and MOT QC published for staff acknowledgement.':'Monthly H&S draft and MOT QC saved.');
      const refresh=document.querySelector('[data-monthly-refresh]');if(refresh)refresh.click();else if(typeof render==='function')render();
    }catch(err){showToast('Could not save Monthly H&S / MOT QC — '+(err&&err.message?err.message:'unknown error'),true);}
    finally{saving=false;if(btn){btn.disabled=false;btn.textContent=publish?'Publish for staff acknowledgement':'Publish';}}
  }

  async function openFile(index){
    const rec=recordFor(siteId(),selectedMonth())||await loadRecord(siteId(),selectedMonth(),true),file=qcFiles(rec)[Number(index)];
    if(!file||!file.path){showToast('MOT QC copy not found.',true);return;}
    const win=window.open('about:blank','_blank');
    try{
      const headers=await authHeaders();
      const res=await fetch(SUPABASE_URL+'/storage/v1/object/authenticated/'+BUCKET+'/'+storagePath(file.path),{headers,cache:'no-store'});
      if(!res.ok)throw new Error('Could not open file ('+res.status+').');
      const blob=await res.blob(),url=URL.createObjectURL(blob);
      if(win)win.location=url;else window.open(url,'_blank');
      setTimeout(function(){URL.revokeObjectURL(url);},60000);
    }catch(err){if(win)win.close();showToast(err&&err.message?err.message:'Could not open MOT QC copy.',true);}
  }

  async function printExtended(){
    const sid=siteId(),month=selectedMonth(),site=siteFor(sid),rec=recordFor(sid,month)||await loadRecord(sid,month,true);
    if(!rec||!site){showToast('Save the monthly check before printing.',true);return;}
    const checks=rec.checks||{};
    const order=Array.from(document.querySelectorAll('[data-monthly-status]')).map(function(x){return String(x.getAttribute('data-monthly-status')||'');});
    const rows=order.map(function(k){const r=checks[k]||{},label=(r.label||(k==='mot_qc'?'MOT QC':k));return '<tr><td><b>'+esc(label)+'</b></td><td>'+esc(String(r.status||'').toUpperCase()||'—')+'</td><td>'+esc(r.note||'')+'</td></tr>';}).join('');
    const headers=await authHeaders();
    let acks=[];
    if(rec.id){const ar=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_acknowledgements?select=*&check_id=eq.'+encodeURIComponent(rec.id)+'&revision=eq.'+encodeURIComponent(rec.revision)+'&order=employee_name.asc',{headers,cache:'no-store'});if(ar.ok)acks=await ar.json();}
    const expected=Array.isArray(rec.expected_staff)?rec.expected_staff:[],byId=new Map(acks.map(function(a){return [String(a.employee_id),a];}));
    const ackRows=expected.map(function(s){const a=byId.get(String(s.id));return '<tr><td><b>'+esc(s.name||'')+'</b></td><td>'+(a?'ACKNOWLEDGED':'OUTSTANDING')+'</td><td>'+(a?esc(fmtDateTime(a.acknowledged_at)):'—')+'</td></tr>';}).join('');
    const done=expected.filter(function(s){return byId.has(String(s.id));}).length;
    const files=qcFiles(rec),fileRows=files.map(function(f){return '<tr><td>'+esc(f.name||'MOT QC copy')+'</td><td>'+esc(fmtDateTime(f.uploadedAt))+'</td></tr>';}).join('');
    const logo=(typeof LOGO_DATA_URI!=='undefined'&&LOGO_DATA_URI)?'<img src="'+LOGO_DATA_URI+'" style="max-width:180px;max-height:60px;">':'';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Monthly H&S Checks</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #d71920;padding-bottom:8px;margin-bottom:12px}h1{font-size:21px;margin:0}h2{font-size:14px;margin:14px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;vertical-align:top}th{background:#eee;text-align:left}.meta{font-size:10px;margin-top:4px;color:#444}.notes{border:1px solid #999;padding:8px;min-height:34px}.footer{margin-top:12px;font-size:9px;color:#555}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
      +'<header><div><h1>Monthly H&amp;S Checks</h1><div class="meta"><b>'+esc(site.name)+'</b> · '+esc(fmtMonth(month))+' · '+esc(String(rec.status||'').toUpperCase())+' · Revision '+esc(rec.revision||1)+'</div><div class="meta">Published '+esc(fmtDateTime(rec.published_at))+(rec.published_by_email?' by '+esc(rec.published_by_email):'')+'</div></div>'+logo+'</header>'
      +'<h2>Monthly inspection including MOT QC</h2><table><thead><tr><th>Check</th><th>Result</th><th>Notes / actions</th></tr></thead><tbody>'+rows+'</tbody></table>'
      +'<h2>MOT QC uploaded copy</h2><table><thead><tr><th>File</th><th>Uploaded</th></tr></thead><tbody>'+(fileRows||'<tr><td colspan="2">No MOT QC copy recorded.</td></tr>')+'</tbody></table>'
      +'<h2>Manager notes / actions</h2><div class="notes">'+esc(rec.manager_notes||'—')+'</div>'
      +'<h2>Staff PIN acknowledgement · '+done+' / '+expected.length+'</h2><table><thead><tr><th>Employee</th><th>Status</th><th>Date / time</th></tr></thead><tbody>'+(ackRows||'<tr><td colspan="3">No staff were on the acknowledgement list when this revision was published.</td></tr>')+'</tbody></table>'
      +'<div class="footer">The acknowledgement covers the published monthly checks, including the MOT QC item and recorded uploaded QC copy. PINs are not printed or stored in this acknowledgement report. Printed '+esc(new Date().toLocaleString('en-GB'))+'.</div>'
      +'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>';
    const w=window.open('about:blank','_blank','width=950,height=850');if(!w){showToast('Allow pop-ups to print the Monthly H&S report.',true);return;}w.document.open();w.document.write(html);w.document.close();
  }

  function injectKioskQc(){
    if(!kioskRecord||!kioskRecord.ok)return;
    const app=document.getElementById('app');if(!app)return;
    const heading=Array.from(app.querySelectorAll('h2')).find(function(h){return /Monthly H&S/i.test(h.textContent||'');});if(!heading)return;
    const card=app.querySelector('.flow-card .card');if(!card||card.querySelector('[data-monthly-kiosk-mot-qc]'))return;
    const qc=((kioskRecord.checks||{}).mot_qc)||{},files=Array.isArray(kioskRecord.mot_qc_files)?kioskRecord.mot_qc_files:[];
    const st=String(qc.status||''),colour=st==='ok'?'var(--green)':st==='issue'?'var(--red)':'var(--amber)';
    card.insertAdjacentHTML('beforeend','<div data-monthly-kiosk-mot-qc style="padding:11px 0;border-bottom:1px solid var(--line-soft);text-align:left;"><div style="display:flex;justify-content:space-between;gap:12px;"><b>MOT QC</b><b style="color:'+colour+';">'+esc(st?st.toUpperCase():'NOT SET')+'</b></div>'+(qc.note?'<div style="font-size:12px;color:var(--muted);margin-top:4px;">'+esc(qc.note)+'</div>':'')+'<div style="font-size:12px;color:var(--muted);margin-top:5px;">'+(files.length?'Completed QC copy uploaded: '+esc(files.map(function(f){return f.name||'MOT QC copy';}).join(', ')):'No QC copy recorded.')+'</div></div>');
    const ack=app.querySelector('[data-monthly-ack]');if(ack){const expl=ack.previousElementSibling;if(expl&&/By pressing acknowledge/i.test(expl.textContent||''))expl.textContent='By pressing acknowledge you confirm that you have read and understood the monthly H&S checks, including the MOT QC result and the recorded uploaded QC copy. Your existing employee PIN verifies who acknowledged it; the PIN itself is not stored in the acknowledgement record.';}
  }

  const originalFetch=window.fetch;
  window.fetch=async function(){
    const res=await originalFetch.apply(this,arguments);
    try{
      const url=String(arguments[0]&&arguments[0].url?arguments[0].url:arguments[0]||'');
      if(url.indexOf('/rest/v1/rpc/monthly_hs_for_pin')>=0&&res.ok){
        res.clone().json().then(function(data){if(data&&data.ok){kioskRecord=data;setTimeout(injectKioskQc,0);}}).catch(function(){});
      }
    }catch(_e){}
    return res;
  };

  try{
    if(typeof renderAdmin==='function'){
      const oldRenderAdmin=renderAdmin;
      renderAdmin=function(){return patchAdminHtml(oldRenderAdmin());};
    }
  }catch(err){console.error('Monthly MOT QC admin patch failed:',err);}

  const observer=new MutationObserver(function(){try{injectKioskQc();}catch(_e){}});
  try{observer.observe(document.documentElement,{childList:true,subtree:true});}catch(_e){}

  window.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('[data-monthly-save],[data-monthly-publish],[data-monthly-print],[data-monthly-mot-file]'):null;if(!t)return;
    if(t.hasAttribute('data-monthly-mot-file')){e.preventDefault();e.stopImmediatePropagation();openFile(t.getAttribute('data-monthly-mot-file'));return;}
    if(!state||!state.admin||state.admin.tab!==TAB_KEY)return;
    if(t.hasAttribute('data-monthly-save')){e.preventDefault();e.stopImmediatePropagation();saveExtended(false);return;}
    if(t.hasAttribute('data-monthly-publish')){e.preventDefault();e.stopImmediatePropagation();saveExtended(true);return;}
    if(t.hasAttribute('data-monthly-print')){e.preventDefault();e.stopImmediatePropagation();printExtended();return;}
  },true);

  document.addEventListener('change',function(e){
    const t=e.target;if(!t)return;
    if(t.id==='monthly-hs-site'||t.id==='monthly-hs-month'){cache.delete(keyFor(siteId(),selectedMonth()));setTimeout(scheduleLoad,0);}
  },true);
})();
