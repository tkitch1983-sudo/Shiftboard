(function(){
'use strict';
const TAB='mot';
const ATTENTION=new Set(['missing','duplicate','credited','extra_invoice']);
const cache=new Map();
const loading=new Set();
let saving=false;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function month(){return String((state&&state.admin&&state.admin.motMonth)||'').slice(0,7);}
function monthStart(m){return String(m||month()).slice(0,7)+'-01';}
function monthLabel(m){try{return salesAnalysisMonthLabel(m);}catch(_){return String(m||'');}}
function sites(){return ((state&&state.config&&state.config.sites)||[]);}
function siteFor(id){return sites().find(s=>String(s.id)===String(id));}
function fmtDate(v){if(!v)return '—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtDateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function keyFor(r){
  return [r.date||'',r.registration||'',r.kind||'',r.status||'',r.amount==null?'':r.amount,(r.codes||[]).join(','),(r.results||[]).join(',')].map(x=>String(x).trim()).join('|');
}
function mapFor(m){return cache.get(String(m).slice(0,7))||new Map();}
async function loadActions(m,force){
  m=String(m||month()).slice(0,7);if(!m)return new Map();
  if(loading.has(m)||(!force&&cache.has(m)))return mapFor(m);
  loading.add(m);
  try{
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_reconciliation_actions?select=*&month_start=eq.'+encodeURIComponent(monthStart(m))+'&order=updated_at.desc',{headers:await authHeaders(),cache:'no-store'});
    if(!res.ok)throw new Error('MOT follow-up '+res.status);
    const rows=await res.json(),mp=new Map();(rows||[]).forEach(r=>mp.set(String(r.row_key),r));cache.set(m,mp);
  }catch(err){console.error(err);}finally{loading.delete(m);}
  return mapFor(m);
}
function scheduleLoad(m){m=String(m||month()).slice(0,7);if(!m||cache.has(m)||loading.has(m))return;setTimeout(()=>loadActions(m,false).then(()=>{try{if(state.admin&&state.admin.tab===TAB)render();}catch(_){}}),0);}
function allRows(){try{return typeof motReconciliation==='function'?motReconciliation():[];}catch(_){return [];}}
function visibleRows(all){const filter=(state.admin&&state.admin.motFilter)||'attention';return all.filter(r=>filter==='all'||(filter==='attention'&&ATTENTION.has(r.status))||(filter==='matched'&&r.status==='invoiced')||(filter==='retests'&&r.kind==='retest'));}
function actionFor(r,m){return mapFor(m).get(keyFor(r))||null;}
function followupEditor(r,m){
  if(!ATTENTION.has(r.status))return '<span style="color:var(--muted-2);">—</span>';
  const a=actionFor(r,m),k=keyFor(r),done=!!(a&&a.actioned);
  return '<div style="min-width:230px;">'
    +'<textarea data-mot-action-reason="'+esc(k)+'" rows="2" placeholder="Reason / what was found" style="width:100%;min-width:210px;padding:7px;resize:vertical;">'+esc(a&&a.reason||'')+'</textarea>'
    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;">'
    +'<label style="font-size:12px;white-space:nowrap;color:'+(done?'var(--green)':'var(--muted)')+';"><input type="checkbox" data-mot-actioned="'+esc(k)+'" '+(done?'checked':'')+'> Actioned</label>'
    +'<button type="button" class="btn-sm" data-mot-action-save="'+esc(k)+'">Save</button>'
    +(done?'<span class="pill pill-approved">DONE</span>':'<span class="pill pill-pending">OUTSTANDING</span>')
    +'</div></div>';
}
function followupPrint(r,m){
  if(!ATTENTION.has(r.status))return {html:'—',done:false};
  const a=actionFor(r,m),done=!!(a&&a.actioned),reason=String(a&&a.reason||'').trim();
  return {done,html:'<b style="color:'+(done?'#147a3f':'#a00')+';">'+(done?'✓ DONE':'OUTSTANDING')+'</b>'+(reason?'<div style="margin-top:3px;">'+esc(reason)+'</div>':'<div style="margin-top:3px;color:#666;">No reason recorded</div>')+(done&&a.actioned_at?'<div style="font-size:9px;color:#666;margin-top:2px;">'+esc(fmtDateTime(a.actioned_at))+'</div>':'')};
}
function tableWithInvoiceCheck(root,excludePrint){
  return Array.from(root.querySelectorAll('table')).find(t=>{
    if(excludePrint&&t.closest('#mot-admin-print'))return false;
    return Array.from(t.querySelectorAll('thead th')).some(th=>/Invoice check/i.test(th.textContent||''));
  });
}
function patchReconciliation(root,m){
  const all=allRows(),vis=visibleRows(all);
  const live=tableWithInvoiceCheck(root,true);
  if(live&&!live.querySelector('[data-mot-followup-head]')){
    const hr=live.querySelector('thead tr');if(hr)hr.insertAdjacentHTML('beforeend','<th data-mot-followup-head>Reason / action</th>');
    Array.from(live.querySelectorAll('tbody tr')).forEach((tr,i)=>{const r=vis[i];if(r)tr.insertAdjacentHTML('beforeend','<td data-mot-followup-cell>'+followupEditor(r,m)+'</td>');});
  }
  const pr=root.querySelector('#mot-admin-print table');
  if(pr&&!pr.querySelector('[data-mot-followup-print-head]')){
    const hr=pr.querySelector('thead tr');if(hr)hr.insertAdjacentHTML('beforeend','<th data-mot-followup-print-head>Follow-up</th>');
    Array.from(pr.querySelectorAll('tbody tr')).forEach((tr,i)=>{const r=all[i];if(!r)return;const f=followupPrint(r,m);if(f.done){tr.style.background='#e8f5e9';tr.style.borderLeft='4px solid #2e7d32';}tr.insertAdjacentHTML('beforeend','<td>'+f.html+'</td>');});
  }
  const attention=all.filter(r=>ATTENTION.has(r.status));
  if(attention.length&&!root.querySelector('[data-mot-action-summary]')){
    const actioned=attention.filter(r=>actionFor(r,m)&&actionFor(r,m).actioned).length;
    const heading=Array.from(root.querySelectorAll('.card')).find(c=>/Needs attention/i.test(c.textContent||'')&&c.querySelector('.mono'));
    if(heading)heading.insertAdjacentHTML('beforeend','<div data-mot-action-summary style="font-size:10px;color:var(--muted);margin-top:4px;">'+(attention.length-actioned)+' outstanding · '+actioned+' actioned</div>');
  }
}
function patchRegister(root){
  const reg=root.querySelector('[data-q-register]');if(!reg)return;
  reg.querySelectorAll('.pill').forEach(p=>{
    const text=(p.textContent||'').trim().toUpperCase();
    if(text==='NOT STARTED'||text==='IN PROGRESS'){p.textContent='IN PROGRESS';p.classList.remove('pill-rejected','pill-approved');p.classList.add('pill-pending');}
    else if(text==='COMPLETE'||text==='DONE'){p.textContent='DONE';p.classList.remove('pill-rejected','pill-pending');p.classList.add('pill-approved');}
    else if(/COMPLETE$/.test(text)){p.textContent=text.replace(/COMPLETE$/,'DONE');}
  });
  reg.querySelectorAll('[data-q-done]').forEach(cb=>{const label=cb.closest('label');if(label){Array.from(label.childNodes).forEach(n=>{if(n.nodeType===3)n.textContent=' Done';});}});
  reg.querySelectorAll('[data-q-save]').forEach(btn=>{
    const id=btn.getAttribute('data-q-save');if(!id)return;const td=btn.closest('td');if(td&&!td.querySelector('[data-mot-qc-print-site]'))td.insertAdjacentHTML('beforeend','<button type="button" class="btn-sm" data-mot-qc-print-site="'+esc(id)+'">🖶 Print site</button>');
  });
}
function fieldBy(name,k){return Array.from(document.querySelectorAll('['+name+']')).find(el=>el.getAttribute(name)===k)||null;}
function patch(html){
  if(!state||!state.admin||state.admin.tab!==TAB)return html;
  const m=month();scheduleLoad(m);
  const wrap=document.createElement('div');wrap.innerHTML=html;const root=wrap.querySelector('.admin-main');if(!root)return html;
  patchReconciliation(root,m);patchRegister(root);return wrap.innerHTML;
}
async function saveAction(k){
  if(saving)return;const m=month();if(!m)return;
  const reason=String(fieldBy('data-mot-action-reason',k)?.value||'').trim();
  const actioned=!!fieldBy('data-mot-actioned',k)?.checked;
  if(actioned&&!reason){showToast('Add the reason / what was found before marking this item actioned.',true);return;}
  saving=true;
  try{
    const h=await authHeaders();h['Content-Type']='application/json';h['Prefer']='resolution=merge-duplicates,return=representation';
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_reconciliation_actions?on_conflict=month_start,row_key',{method:'POST',headers:h,body:JSON.stringify({month_start:monthStart(m),row_key:k,reason,actioned})});
    if(!res.ok)throw new Error(await res.text()||'Save failed');
    cache.delete(m);await loadActions(m,true);showToast(actioned?'MOT follow-up marked actioned.':'MOT follow-up saved.');render();
  }catch(err){showToast('Could not save MOT follow-up — '+(err.message||err),true);}finally{saving=false;}
}
async function printSite(siteId){
  const m=month(),s=siteFor(siteId);if(!m||!s)return;
  try{
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_monthly_qc?select=*&site_id=eq.'+encodeURIComponent(siteId)+'&month_start=eq.'+encodeURIComponent(monthStart(m))+'&limit=1',{headers:await authHeaders(),cache:'no-store'});
    if(!res.ok)throw new Error('MOT QC '+res.status);const r=(await res.json())[0]||null,done=!!(r&&r.completed),log=Array.isArray(r&&r.progress_log)?r.progress_log:[];
    const history=log.length?'<h2>Progress history</h2><table><thead><tr><th>Saved</th><th>Checked through</th><th>Findings</th><th>Action</th><th>Status</th></tr></thead><tbody>'+log.map(x=>'<tr><td>'+esc(fmtDateTime(x.saved_at))+'</td><td>'+esc(fmtDate(x.checked_through))+'</td><td>'+esc(x.issues_found||'—')+'</td><td>'+esc(x.actions_taken||'—')+'</td><td><b>'+(x.completed?'DONE':'IN PROGRESS')+'</b></td></tr>').join('')+'</tbody></table>':'';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>MOT QC '+esc(s.name)+'</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}.status{display:inline-block;padding:4px 10px;border:1px solid '+(done?'#2e7d32':'#b26a00')+';font-weight:700}</style></head><body><h1>MOT Monthly QC · '+esc(s.name)+'</h1><div>'+esc(monthLabel(m))+'</div><h2>Site register</h2><table><tbody><tr><th>Status</th><td><span class="status">'+(done?'DONE':'IN PROGRESS')+'</span></td></tr><tr><th>Checked through</th><td>'+esc(fmtDate(r&&r.checked_through))+'</td></tr><tr><th>Issues / findings</th><td>'+esc(r&&r.issues_found||'None recorded')+'</td></tr><tr><th>Action / resolution</th><td>'+esc(r&&r.actions_taken||'—')+'</td></tr><tr><th>Last saved</th><td>'+esc(fmtDateTime(r&&r.updated_at))+'</td></tr><tr><th>Saved by</th><td>'+esc(r&&r.updated_by_email||'—')+'</td></tr></tbody></table>'+history+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))<\/script></body></html>';
    const w=window.open('about:blank','_blank','width=900,height=850');if(!w)return showToast('Allow pop-ups to print this site.',true);w.document.open();w.document.write(html);w.document.close();
  }catch(err){showToast('Could not print site QC — '+(err.message||err),true);}
}

window.addEventListener('click',function(ev){
  const t=ev.target&&ev.target.closest?ev.target.closest('[data-mot-action-save],[data-mot-qc-print-site]'):null;if(!t)return;
  if(t.hasAttribute('data-mot-action-save')){ev.preventDefault();ev.stopImmediatePropagation();saveAction(t.getAttribute('data-mot-action-save'));return;}
  if(t.hasAttribute('data-mot-qc-print-site')){ev.preventDefault();ev.stopImmediatePropagation();printSite(t.getAttribute('data-mot-qc-print-site'));return;}
},true);

setTimeout(function(){
  try{const old=renderAdmin;renderAdmin=function(){return patch(old());};if(state.admin&&state.admin.authed&&state.admin.tab===TAB)render();}
  catch(err){console.error('MOT follow-up setup failed',err);}
},0);
})();
