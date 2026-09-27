(function(){
'use strict';
const MOT='mot',HS='monthlyhs',S=new Map(),L=new Set();let busy=false;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const motMonth=()=>String((state&&state.admin&&state.admin.motMonth)||nowMonth()).slice(0,7);
const hsMonth=()=>String((state&&state.admin&&state.admin.monthlyHsMonth)||nowMonth()).slice(0,7);
const monthStart=m=>String(m||nowMonth()).slice(0,7)+'-01';
const hsSite=()=>!state||!state.admin?'':state.admin.role==='site'?String(state.admin.scopeSite||''):String(state.admin.monthlyHsSite||'');
const siteFor=id=>(((state&&state.config&&state.config.sites)||[]).find(s=>String(s.id)===String(id))||null);
const fmt=v=>{if(!v)return'—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:String(v).length===10?undefined:'2-digit',minute:String(v).length===10?undefined:'2-digit'})};
function safetyMap(m){return S.get(String(m).slice(0,7))||new Map();}
async function loadSafety(m,force){
 m=String(m||motMonth()).slice(0,7);if(L.has(m)||(!force&&S.has(m)))return safetyMap(m);L.add(m);
 try{const h=await authHeaders(),r=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=site_id,month_start,status,checks,published_at,published_by_email,mot_qc_register_id&month_start=eq.'+encodeURIComponent(monthStart(m)),{headers:h,cache:'no-store'});if(!r.ok)throw Error('Monthly Safety '+r.status);const a=await r.json(),mp=new Map();(a||[]).forEach(x=>mp.set(String(x.site_id),x));S.set(m,mp);}catch(x){console.error(x)}finally{L.delete(m)}return safetyMap(m);
}
function schedule(m){m=String(m).slice(0,7);if(S.has(m)||L.has(m))return;setTimeout(()=>loadSafety(m,false).then(()=>{try{render()}catch(_){}}),0)}
function safetyDone(r){const st=String(r&&r.checks&&r.checks.mot_qc&&r.checks.mot_qc.status||'');return !!r&&r.status==='published'&&(st==='ok'||st==='issue');}
function safetyResult(r){const st=String(r&&r.checks&&r.checks.mot_qc&&r.checks.mot_qc.status||'');return st==='ok'?'OK':st==='issue'?'ISSUE':'NOT COMPLETED';}
function patchRegister(root,m){
 schedule(m);const sm=safetyMap(m),reg=root.querySelector('[data-q-register]');if(!reg)return;
 const allPrint=reg.querySelector('[data-q-print]');if(allPrint)allPrint.remove();
 const adminPrint=root.querySelector('[data-action="mot-print"]');if(adminPrint){adminPrint.removeAttribute('data-action');adminPrint.setAttribute('data-mot-admin-print-v2','1');adminPrint.textContent='🖶 Print MOT Admin Sheet';}
 let total=0,done=0;
 reg.querySelectorAll('tbody tr').forEach(tr=>{
   const cb=tr.querySelector('[data-q-done]'),save=tr.querySelector('[data-q-save]');const id=String(cb?.getAttribute('data-q-done')||save?.getAttribute('data-q-save')||'');if(!id)return;total++;
   const sr=sm.get(id),fromSafety=safetyDone(sr),pill=tr.querySelector('.pill');
   if(fromSafety){
     if(cb){cb.checked=true;cb.disabled=true;const label=cb.closest('label');if(label)label.title='Completed in Monthly Safety Checks';}
     if(pill){pill.textContent='DONE';pill.classList.remove('pill-pending','pill-rejected');pill.classList.add('pill-approved');const td=pill.closest('td'),sub=td&&td.querySelector('div');if(sub)sub.textContent='Monthly Safety · '+fmt(sr.published_at);}
     const d=tr.querySelector('[data-q-through]');if(d&&sr.published_at)d.value=String(sr.published_at).slice(0,10);
   }
   if((pill&&String(pill.textContent).trim().toUpperCase()==='DONE')||(cb&&cb.checked))done++;
   const p=tr.querySelector('[data-mot-qc-print-site]');if(p){const sid=p.getAttribute('data-mot-qc-print-site');p.removeAttribute('data-mot-qc-print-site');p.setAttribute('data-mot-site-print-v2',sid);p.textContent='🖶 Print site';}
 });
 Array.from(reg.querySelectorAll('.pill')).forEach(p=>{if(/\d+\s*\/\s*\d+\s*(DONE|COMPLETE)/i.test(String(p.textContent||''))){p.textContent=done+' / '+total+' DONE';p.classList.toggle('pill-approved',total>0&&done===total);p.classList.toggle('pill-pending',!(total>0&&done===total));}});
}
function patchHs(root){
 const row=root.querySelector('[data-monthly-mot-qc-row]');if(row){const st=row.querySelector('[data-monthly-status="mot_qc"]'),nt=row.querySelector('[data-monthly-note="mot_qc"]');if(st)st.disabled=false;if(nt)nt.readOnly=false;}
 const link=root.querySelector('[data-q-link]');if(link)link.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><b>MOT QC · Monthly Safety</b><div style="font-size:12px;color:var(--muted);margin-top:3px">Complete the MOT QC result above. When this Monthly Safety check is published, the same site/month is marked DONE on the MOT QC Register automatically.</div></div><span class="pill pill-pending">LINKED</span></div>';
 const save=root.querySelector('[data-monthly-save]');if(save){save.removeAttribute('data-monthly-save');save.setAttribute('data-monthly-save-v2','1');}
 const pub=root.querySelector('[data-monthly-publish]');if(pub){pub.removeAttribute('data-monthly-publish');pub.setAttribute('data-monthly-publish-v2','1');}
}
function patch(html){
 if(!state||!state.admin)return html;const w=document.createElement('div');w.innerHTML=html;const root=w.querySelector('.admin-main');if(!root)return html;
 if(state.admin.tab===MOT)patchRegister(root,motMonth());
 if(state.admin.tab===HS)patchHs(root);
 return w.innerHTML;
}
function collectChecks(){const out={};document.querySelectorAll('[data-monthly-status]').forEach(sel=>{const k=String(sel.getAttribute('data-monthly-status')||'');if(!k)return;const note=document.querySelector('[data-monthly-note="'+k+'"]'),td=sel.closest('tr')?.querySelector('td');out[k]={label:k==='mot_qc'?'MOT QC':String(td?.textContent||k).trim(),status:String(sel.value||''),note:String(note?.value||'').trim()};});return out;}
async function existingHs(s,m){const r=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&site_id=eq.'+encodeURIComponent(s)+'&month_start=eq.'+encodeURIComponent(monthStart(m))+'&limit=1',{headers:await authHeaders(),cache:'no-store'});if(!r.ok)throw Error('Monthly Safety '+r.status);return (await r.json())[0]||{};}
async function saveHs(publish){
 if(busy)return;const s=hsSite(),m=hsMonth();if(!s)return showToast('Select a workshop first.',true);const checks=collectChecks(),missing=Object.values(checks).filter(x=>!x.status).map(x=>x.label),mot=checks.mot_qc||{};
 if(publish&&missing.length)return showToast('Complete every monthly item before publishing: '+missing.join(', ')+'.',true);
 if(publish&&!['ok','issue'].includes(mot.status))return showToast('Complete the MOT QC before publishing.',true);
 busy=true;const btn=document.querySelector('[data-monthly-publish-v2]');if(btn){btn.disabled=true;btn.textContent='Saving…'};
 try{const ex=await existingHs(s,m),h=await authHeaders();h['Content-Type']='application/json';h['Prefer']='resolution=merge-duplicates,return=representation';const body={site_id:s,month_start:monthStart(m),checks,manager_notes:String(document.getElementById('monthly-hs-manager-notes')?.value||'').trim(),mot_qc_files:Array.isArray(ex.mot_qc_files)?ex.mot_qc_files:[],mot_qc_register_id:ex.mot_qc_register_id||null,status:publish?'published':(ex.status==='published'?'published':'draft')};const r=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?on_conflict=site_id,month_start',{method:'POST',headers:h,body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text()||'Save failed');S.delete(m);await loadSafety(m,true);showToast(publish?'Monthly Safety published — MOT QC Register updated to DONE.':'Monthly Safety draft saved.');const refresh=document.querySelector('[data-monthly-refresh]');if(refresh)refresh.click();else render();}
 catch(x){showToast('Could not save Monthly Safety — '+(x.message||x),true)}finally{busy=false;if(btn){btn.disabled=false;btn.textContent=publish?'Publish for staff acknowledgement':'Publish'}}
}
function printAdmin(){const m=motMonth(),src=document.getElementById('mot-admin-print');if(!src)return showToast('No MOT Admin sheet is available to print.',true);const html='<!doctype html><html><head><meta charset="utf-8"><title>MOT Admin '+esc(m)+'</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;text-align:left;vertical-align:top}.card{border:1px solid #aaa;padding:6px}.mot-print-source{display:block!important}</style></head><body>'+src.innerHTML+'<script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>';const w=window.open('about:blank','_blank','width=1100,height=850');if(!w)return showToast('Allow pop-ups to print.',true);w.document.open();w.document.write(html);w.document.close();}
async function printSite(id){
 const m=motMonth(),s=siteFor(id);if(!s)return;try{const h=await authHeaders();const [qr,hr]=await Promise.all([fetch(SUPABASE_URL+'/rest/v1/mot_monthly_qc?select=*&site_id=eq.'+encodeURIComponent(id)+'&month_start=eq.'+encodeURIComponent(monthStart(m))+'&limit=1',{headers:h,cache:'no-store'}),fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=site_id,status,checks,published_at,published_by_email&site_id=eq.'+encodeURIComponent(id)+'&month_start=eq.'+encodeURIComponent(monthStart(m))+'&limit=1',{headers:h,cache:'no-store'})]);if(!qr.ok||!hr.ok)throw Error('Could not load site QC');const q=(await qr.json())[0]||{},hs=(await hr.json())[0]||null,done=!!q.completed||safetyDone(hs),checked=q.checked_through||(hs?.published_at?String(hs.published_at).slice(0,10):''),status=done?'DONE':'IN PROGRESS';const html='<!doctype html><html><head><meta charset="utf-8"><title>MOT QC '+esc(s.name)+'</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}h1{font-size:22px;margin:0 0 5px}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:8px;text-align:left}.done{font-weight:800;color:#16733a}</style></head><body><h1>MOT Monthly QC · '+esc(s.name)+'</h1><div>'+esc(new Date(monthStart(m)+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}))+'</div><h2>Site QC status</h2><table><tbody><tr><th>Status</th><td class="'+(done?'done':'')+'">'+status+'</td></tr><tr><th>Checked through</th><td>'+esc(fmt(checked))+'</td></tr><tr><th>Monthly Safety MOT QC</th><td>'+esc(safetyResult(hs))+'</td></tr><tr><th>Monthly Safety published</th><td>'+esc(hs&&hs.status==='published'?fmt(hs.published_at):'Not published')+'</td></tr><tr><th>Published by</th><td>'+esc(hs&&hs.published_by_email||'—')+'</td></tr></tbody></table><script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>';const w=window.open('about:blank','_blank','width=900,height=850');if(!w)return showToast('Allow pop-ups to print this site.',true);w.document.open();w.document.write(html);w.document.close();}catch(x){showToast('Could not print site QC — '+(x.message||x),true)}
}
window.addEventListener('click',ev=>{const t=ev.target?.closest?.('[data-monthly-save-v2],[data-monthly-publish-v2],[data-mot-admin-print-v2],[data-mot-site-print-v2]');if(!t)return;if(t.hasAttribute('data-monthly-save-v2')){ev.preventDefault();ev.stopImmediatePropagation();saveHs(false);return}if(t.hasAttribute('data-monthly-publish-v2')){ev.preventDefault();ev.stopImmediatePropagation();saveHs(true);return}if(t.hasAttribute('data-mot-admin-print-v2')){ev.preventDefault();ev.stopImmediatePropagation();printAdmin();return}if(t.hasAttribute('data-mot-site-print-v2')){ev.preventDefault();ev.stopImmediatePropagation();printSite(t.getAttribute('data-mot-site-print-v2'));return}},true);
setTimeout(()=>{try{const old=renderAdmin;renderAdmin=function(){return patch(old())};if(state.admin&&state.admin.authed&&[MOT,HS].includes(state.admin.tab))render()}catch(x){console.error('MOT safety sync setup failed',x)}},0);
})();
