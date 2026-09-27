(function(){
'use strict';
const TAB='mot';
let deleting=false;
function currentMonth(){return String((state&&state.admin&&state.admin.motMonth)||new Date().toISOString().slice(0,7)).slice(0,7);}
function monthLabel(m){try{return new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});}catch(_){return m;}}
function currentImport(source){const m=currentMonth(),rows=(state&&state.admin&&Array.isArray(state.admin.motImports))?state.admin.motImports:[];return rows.find(r=>String(r.source)===String(source)&&String(r.report_month||'').slice(0,7)===m)||null;}
function patch(html){
  if(!state||!state.admin||state.admin.tab!==TAB||typeof isTonyLogin!=='function'||!isTonyLogin())return html;
  const w=document.createElement('div');w.innerHTML=html;const root=w.querySelector('.admin-main');if(!root)return html;
  [['mot-system-file','mot_system'],['mot-autowork-file','autowork']].forEach(([id,source])=>{
    const input=root.querySelector('#'+id),rec=currentImport(source);if(!input||!rec)return;
    const card=input.closest('.card');if(!card||card.querySelector('[data-mot-import-delete="'+source+'"]'))return;
    const upload=card.querySelector('[data-action="mot-upload"][data-source="'+source+'"]');if(!upload)return;
    upload.insertAdjacentHTML('afterend','<button type="button" class="add-btn" data-mot-import-delete="'+source+'" style="border-color:var(--red);color:var(--red);margin-left:6px;">Clear / Delete</button>');
  });
  return w.innerHTML;
}
async function removeImport(source){
  if(deleting)return;const rec=currentImport(source);if(!rec){showToast('That MOT file is no longer loaded.',true);return;}
  const label=source==='mot_system'?'MOT testing-station log':'Autowork MOT invoices';
  if(!window.confirm('Delete the '+label+' for '+monthLabel(currentMonth())+'?\n\nThe comparison will update immediately.'))return;
  deleting=true;
  try{
    const h=await authHeaders();h['Prefer']='return=minimal';
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_imports?id=eq.'+encodeURIComponent(rec.id),{method:'DELETE',headers:h});
    if(!res.ok){let msg='Delete failed ('+res.status+')';try{const d=await res.json();msg=d.message||msg;}catch(_){}throw new Error(msg);}
    state.admin.motImports=null;
    if(typeof loadMotImports==='function')await loadMotImports(true);
    showToast(label+' cleared for '+monthLabel(currentMonth())+'.');
    if(typeof render==='function')render();
  }catch(err){showToast(err&&err.message?err.message:'Could not delete the MOT file.',true);}
  finally{deleting=false;}
}
window.addEventListener('click',function(ev){const t=ev.target&&ev.target.closest?ev.target.closest('[data-mot-import-delete]'):null;if(!t)return;ev.preventDefault();ev.stopImmediatePropagation();removeImport(t.getAttribute('data-mot-import-delete'));},true);
setTimeout(function(){try{const old=renderAdmin;renderAdmin=function(){return patch(old());};if(state.admin&&state.admin.authed&&state.admin.tab===TAB)render();}catch(err){console.error('MOT import delete setup failed',err);}},0);
})();
