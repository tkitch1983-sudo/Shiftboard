(function(){
'use strict';
const M='mot',H='monthlyhs',NO=new Set(['mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf']),C=new Map(),L=new Set();let busy=false,kiosk=null;
const e=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ym=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const ms=m=>String(m||ym()).slice(0,7)+'-01';
const fm=m=>new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
const fd=v=>{if(!v)return'—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
const fdt=v=>{if(!v)return'—';const d=new Date(v);return d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const me=m=>{const [y,n]=String(m).slice(0,7).split('-').map(Number),d=new Date(y,n,0,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const today=m=>{const d=new Date(),x=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');return x===String(m).slice(0,7)?x+'-'+String(d.getDate()).padStart(2,'0'):me(m)};
const sites=()=>((state&&state.config&&state.config.sites)||[]);
const site=id=>sites().find(s=>String(s.id)===String(id));
const workshop=s=>s&&!NO.has(String(s.id||''))&&!/petrol|filling station|floaters|upper management/.test(String(s.name||'').toLowerCase())&&String(s.name||'').toLowerCase()!=='great ayton';
const workshops=()=>sites().filter(workshop).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const motMonth=()=>String((state&&state.admin&&state.admin.motMonth)||ym()).slice(0,7);
const hsMonth=()=>String((state&&state.admin&&state.admin.monthlyHsMonth)||ym()).slice(0,7);
const hsSite=()=>!state||!state.admin?'':state.admin.role==='site'?String(state.admin.scopeSite||''):String(state.admin.monthlyHsSite||'');
const rows=m=>C.get(String(m).slice(0,7))||[];
const rec=(m,s)=>rows(m).find(r=>String(r.site_id)===String(s))||null;

async function load(m,force){
 m=String(m||ym()).slice(0,7);if(L.has(m)||(!force&&C.has(m)))return rows(m);L.add(m);
 try{const r=await fetch(SUPABASE_URL+'/rest/v1/mot_monthly_qc?select=*&month_start=eq.'+encodeURIComponent(ms(m))+'&order=site_id.asc',{headers:await authHeaders(),cache:'no-store'});if(!r.ok)throw Error('MOT QC '+r.status);C.set(m,await r.json()||[]);}
 catch(x){console.error(x);}finally{L.delete(m)}return rows(m);
}
function schedule(m){m=String(m).slice(0,7);if(C.has(m)||L.has(m))return;setTimeout(()=>load(m,false).then(()=>{try{render()}catch(_){}}),0)}
function badge(r){return !r?['NOT STARTED','pill-rejected']:r.completed?['COMPLETE','pill-approved']:['IN PROGRESS','pill-pending']}

function registerHtml(m){
 schedule(m);const map=new Map(rows(m).map(r=>[String(r.site_id),r])),ws=workshops(),done=ws.filter(s=>map.get(String(s.id))?.completed).length;
 const trs=ws.map(s=>{const r=map.get(String(s.id)),b=badge(r),through=r?.checked_through||today(m);return `<tr>
 <td><b>${e(s.name)}</b></td>
 <td><input type="date" data-q-through="${e(s.id)}" value="${e(through)}" min="${e(ms(m))}" max="${e(me(m))}"></td>
 <td><textarea data-q-issues="${e(s.id)}" rows="2" placeholder="What was found?">${e(r?.issues_found||'')}</textarea></td>
 <td><textarea data-q-actions="${e(s.id)}" rows="2" placeholder="Action taken / follow-up">${e(r?.actions_taken||'')}</textarea></td>
 <td><label style="white-space:nowrap"><input type="checkbox" data-q-done="${e(s.id)}" ${r?.completed?'checked':''}> Month complete</label></td>
 <td><span class="pill ${b[1]}">${b[0]}</span><div style="font-size:10px;color:var(--muted);margin-top:4px">${r?'Saved '+e(fdt(r.updated_at)):'Not saved'}</div></td>
 <td><button type="button" class="btn-sm" data-q-save="${e(s.id)}">Save progress</button></td></tr>`}).join('');
 return `<div class="card" data-q-register style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h3>Monthly MOT QC Register</h3><div style="font-size:12px;color:var(--muted);margin-top:4px">Save each site as you go. “Checked through” lets you stop today and return later in the same month.</div></div><div><span class="pill ${done===ws.length&&ws.length?'pill-approved':'pill-pending'}">${done} / ${ws.length} COMPLETE</span> <button type="button" class="btn-sm" data-q-print>🖶 Print MOT Admin + QC Register</button></div></div>
 <div style="margin:10px 0;padding:10px 12px;border-left:4px solid var(--amber);background:var(--panel-2);font-size:12px;color:var(--muted)"><b style="color:var(--text)">Save progress today, then revisit it.</b> Only tick <b>Month complete</b> when Checked through is the last day of the month.</div>
 <div style="overflow:auto"><table style="min-width:1120px"><thead><tr><th>Site</th><th>Checked through</th><th>Issues / findings</th><th>Action / resolution</th><th>Completion</th><th>Status</th><th></th></tr></thead><tbody>${trs}</tbody></table></div></div>`;
}
function linkHtml(m,s){
 schedule(m);const r=rec(m,s),b=badge(r);
 return `<div data-q-link style="margin-top:14px;padding:13px;border:1px solid var(--line-soft);border-left:4px solid ${r?.completed?'var(--green)':'var(--amber)'};border-radius:10px">
 <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>MOT QC · linked monthly register</b><div style="font-size:12px;color:var(--muted);margin-top:3px">${r?'Checked through '+e(fd(r.checked_through))+' · saved '+e(fdt(r.updated_at)):'No MOT QC progress saved for this site/month yet.'}</div></div><span class="pill ${b[1]}">${b[0]}</span></div>
 ${r?.issues_found?`<div style="font-size:12px;margin-top:8px"><b>Findings:</b> ${e(r.issues_found)}</div>`:''}${r?.actions_taken?`<div style="font-size:12px;margin-top:5px"><b>Action:</b> ${e(r.actions_taken)}</div>`:''}
 <div style="margin-top:9px"><button type="button" class="btn-sm" data-q-open>Open MOT QC Register</button></div>
 <div style="font-size:11px;color:${r?.completed?'var(--green)':'var(--amber)'};margin-top:7px">${r?.completed?'Completed register is the MOT QC evidence; no duplicate upload is required.':'Monthly H&S can be saved as a draft, but cannot be published until MOT QC is complete.'}</div></div>`;
}
function patch(html){
 if(!state||!state.admin)return html;const w=document.createElement('div');w.innerHTML=html,m=w.querySelector('.admin-main');if(!m)return html;
 if(state.admin.tab===M){const x=motMonth();schedule(x);const sel=m.querySelector('#mot-month');if(sel&&!Array.from(sel.options).some(o=>o.value===x)){const o=document.createElement('option');o.value=x;o.textContent=fm(x);o.selected=true;sel.prepend(o)}if(!m.querySelector('[data-q-register]')){const foot=Array.from(m.querySelectorAll('div')).find(d=>/A matching registration counts as invoiced/i.test(d.textContent||''));(foot||m).insertAdjacentHTML(foot?'beforebegin':'beforeend',registerHtml(x))}const p=m.querySelector('[data-action="mot-print"]');if(p)p.textContent='🖶 Print MOT Admin + QC Register';}
 if(state.admin.tab===H){const x=hsMonth(),s=hsSite();if(s){schedule(x);const old=m.querySelector('[data-monthly-mot-qc-upload]');if(old)old.outerHTML=linkHtml(x,s);const r=rec(x,s),row=m.querySelector('[data-monthly-mot-qc-row]');if(r&&row){const st=row.querySelector('[data-monthly-status="mot_qc"]'),nt=row.querySelector('[data-monthly-note="mot_qc"]'),issue=!!String(r.issues_found||'').trim();if(st){st.value=issue?'issue':'ok';st.disabled=true}if(nt){nt.value='Checked through '+fd(r.checked_through)+(r.issues_found?' · '+r.issues_found:' · no issues recorded')+(r.actions_taken?' · action: '+r.actions_taken:'');nt.readOnly=true}}}}
 return w.innerHTML;
}
const val=q=>String(document.querySelector(q)?.value||'').trim(),chk=q=>!!document.querySelector(q)?.checked;
async function saveSite(id){
 if(busy)return;const m=motMonth(),s=site(id);if(!s)return;const through=val(`[data-q-through="${id}"]`)||today(m),done=chk(`[data-q-done="${id}"]`);
 if(done&&through!==me(m)){showToast('To mark '+s.name+' month complete, set Checked through to '+fd(me(m))+'. Save progress without the tick until then.',true);return}
 busy=true;const b=document.querySelector(`[data-q-save="${id}"]`);if(b){b.disabled=true;b.textContent='Saving…'}
 try{const h=await authHeaders();h['Content-Type']='application/json';h['Prefer']='resolution=merge-duplicates,return=representation';const body={site_id:id,month_start:ms(m),checked_through:through,issues_found:val(`[data-q-issues="${id}"]`),actions_taken:val(`[data-q-actions="${id}"]`),completed:done};const r=await fetch(SUPABASE_URL+'/rest/v1/mot_monthly_qc?on_conflict=site_id,month_start',{method:'POST',headers:h,body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text()||'Save failed');C.delete(m);await load(m,true);showToast(s.name+' MOT QC '+(done?'marked complete.':'progress saved through '+fd(through)+'.'));render()}
 catch(x){showToast('Could not save MOT QC — '+(x.message||x),true)}finally{busy=false}
}
function collect(){const o={};document.querySelectorAll('[data-monthly-status]').forEach(s=>{const k=s.dataset.monthlyStatus,n=document.querySelector(`[data-monthly-note="${k}"]`),td=s.closest('tr')?.querySelector('td');o[k]={label:k==='mot_qc'?'MOT QC':(td?.textContent.trim()||k),status:String(s.value||''),note:String(n?.value||'').trim()}});return o}
async function hsExisting(s,m){const r=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?select=*&site_id=eq.'+encodeURIComponent(s)+'&month_start=eq.'+encodeURIComponent(ms(m))+'&limit=1',{headers:await authHeaders(),cache:'no-store'});if(!r.ok)throw Error('Monthly H&S '+r.status);return (await r.json())[0]||{}}
async function saveHs(pub){
 if(busy)return;const s=hsSite(),m=hsMonth();if(!s)return showToast('Select a workshop first.',true);busy=true;
 try{const ex=await hsExisting(s,m);await load(m,true);const q=rec(m,s),checks=collect();if(q){const issue=!!String(q.issues_found||'').trim();checks.mot_qc={label:'MOT QC',status:issue?'issue':'ok',note:'Checked through '+fd(q.checked_through)+(q.issues_found?' · '+q.issues_found:' · no issues recorded')+(q.actions_taken?' · action: '+q.actions_taken:'')}}if(pub){const miss=Object.values(checks).filter(x=>!x.status).map(x=>x.label);if(miss.length)throw Error('Complete every monthly item before publishing: '+miss.join(', ')+'.');if(!q?.completed&&!(Array.isArray(ex.mot_qc_files)&&ex.mot_qc_files.length))throw Error('Complete this site’s MOT QC Register before publishing.')}
 const h=await authHeaders();h['Content-Type']='application/json';h['Prefer']='resolution=merge-duplicates,return=representation';const body={site_id:s,month_start:ms(m),checks,manager_notes:String(document.getElementById('monthly-hs-manager-notes')?.value||'').trim(),mot_qc_files:Array.isArray(ex.mot_qc_files)?ex.mot_qc_files:[],mot_qc_register_id:q?.id||ex.mot_qc_register_id||null,status:pub?'published':(ex.status==='published'?'published':'draft')};const r=await fetch(SUPABASE_URL+'/rest/v1/monthly_hs_checks?on_conflict=site_id,month_start',{method:'POST',headers:h,body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text()||'Save failed');showToast(pub?'Monthly H&S published with linked MOT QC.':'Monthly H&S draft saved with MOT QC progress linked.');document.querySelector('[data-monthly-refresh]')?.click()}
 catch(x){showToast('Could not save Monthly H&S / MOT QC — '+(x.message||x),true)}finally{busy=false}
}
function section(r,s,m){return `<h2>${e(s.name)} · ${e(fm(m))}</h2><table><tbody><tr><th>Checked through</th><td>${e(fd(r?.checked_through))}</td><th>Status</th><td>${r?.completed?'MONTH COMPLETE':'IN PROGRESS'}</td></tr><tr><th>Issues / findings</th><td colspan="3">${e(r?.issues_found||'None recorded')}</td></tr><tr><th>Action / resolution</th><td colspan="3">${e(r?.actions_taken||'—')}</td></tr><tr><th>Last saved</th><td>${e(fdt(r?.updated_at))}</td><th>Saved by</th><td>${e(r?.updated_by_email||'—')}</td></tr></tbody></table>`}
async function printAll(){
 const m=motMonth();await load(m,true);const admin=document.getElementById('mot-admin-print'),reg=workshops().map(s=>rec(m,s.id)?section(rec(m,s.id),s,m):`<h2>${e(s.name)}</h2><p>Not started.</p>`).join(''),body=(admin?'<h2>MOT Reconciliation</h2>'+admin.innerHTML+'<div class="pb"></div>':'')+'<h2>Site QC Register</h2>'+reg;
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>MOT Admin + QC</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;font-size:10px}h1{font-size:22px}h2{font-size:15px;margin:14px 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th,td{border:1px solid #999;padding:5px;text-align:left}.pb{page-break-before:always}</style></head><body><h1>MOT Administration + Monthly QC · ${e(fm(m))}</h1>${body}<script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>`;const w=window.open('about:blank','_blank','width=1100,height=850');if(!w)return showToast('Allow pop-ups to print.',true);w.document.write(html);w.document.close();
}
function kioskPatch(){if(!kiosk?.mot_qc_register)return;const box=document.querySelector('[data-monthly-kiosk-mot-qc]'),q=kiosk.mot_qc_register;if(box)box.innerHTML=`<div style="display:flex;justify-content:space-between"><b>MOT QC</b><b>${e(String(kiosk.checks?.mot_qc?.status||'').toUpperCase())}</b></div><div style="font-size:12px;color:var(--muted);margin-top:5px">Linked register checked through ${e(fd(q.checked_through))}.</div>${q.issues_found?`<div style="font-size:12px;color:var(--muted);margin-top:4px"><b>Findings:</b> ${e(q.issues_found)}</div>`:''}${q.actions_taken?`<div style="font-size:12px;color:var(--muted);margin-top:4px"><b>Action:</b> ${e(q.actions_taken)}</div>`:''}`}

const pf=window.fetch;window.fetch=async function(){const r=await pf.apply(this,arguments);try{const u=String(arguments[0]?.url||arguments[0]||'');if(u.includes('/rest/v1/rpc/monthly_hs_for_pin')&&r.ok)r.clone().json().then(d=>{if(d?.ok){kiosk=d;setTimeout(kioskPatch,0)}})}catch(_){}return r};
window.addEventListener('click',ev=>{const t=ev.target?.closest?.('[data-q-save],[data-q-print],[data-q-open],[data-monthly-save],[data-monthly-publish],[data-action="mot-print"]');if(!t)return;
 if(t.hasAttribute('data-monthly-save')&&state.admin?.tab===H){ev.preventDefault();ev.stopImmediatePropagation();saveHs(false);return}
 if(t.hasAttribute('data-monthly-publish')&&state.admin?.tab===H){ev.preventDefault();ev.stopImmediatePropagation();saveHs(true);return}
 if(t.hasAttribute('data-q-save')){ev.preventDefault();ev.stopImmediatePropagation();saveSite(t.dataset.qSave);return}
 if(t.hasAttribute('data-q-open')){ev.preventDefault();ev.stopImmediatePropagation();state.admin.motMonth=hsMonth();state.admin.tab=M;render();return}
 if(t.hasAttribute('data-q-print')||(t.matches?.('[data-action="mot-print"]')&&state.admin?.tab===M)){ev.preventDefault();ev.stopImmediatePropagation();printAll();return}
},true);
new MutationObserver(()=>{try{kioskPatch()}catch(_){}}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(()=>{try{const old=renderAdmin;renderAdmin=function(){return patch(old())};if(state.admin?.authed&&[M,H].includes(state.admin.tab))render()}catch(x){console.error('MOT QC register setup failed',x)}},0);
})();