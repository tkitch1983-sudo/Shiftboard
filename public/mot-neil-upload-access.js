(function(){
'use strict';
const TAB='mot';
const NEIL='neil@neautoservices.com';
let busy=false;
function email(){return String((_session&&_session.email)||'').trim().toLowerCase();}
function isNeil(){return state&&state.admin&&state.admin.role==='super'&&email()===NEIL;}
function currentMonth(){return String((state&&state.admin&&state.admin.motMonth)||new Date().toISOString().slice(0,7)).slice(0,7);}
function monthLabel(m){try{return new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});}catch(_){return m;}}
function currentImport(source){const m=currentMonth(),rows=(state&&state.admin&&Array.isArray(state.admin.motImports))?state.admin.motImports:[];return rows.find(r=>String(r.source)===String(source)&&String(r.report_month||'').slice(0,7)===m)||null;}
function cardFor(root,label){return Array.from(root.querySelectorAll('.card')).find(c=>String(c.querySelector('b')?.textContent||'').trim()===label)||null;}
function patch(html){
  if(!isNeil()||!state.admin||state.admin.tab!==TAB)return html;
  const w=document.createElement('div');w.innerHTML=html;const root=w.querySelector('.admin-main');if(!root)return html;
  [
    ['MOT testing-station log','mot_system','mot-system-file'],
    ['Autowork MOT invoices','autowork','mot-autowork-file']
  ].forEach(([label,source,id])=>{
    const card=cardFor(root,label);if(!card)return;
    if(!card.querySelector('#'+id)){
      const controls=document.createElement('div');controls.className='no-print';controls.style.marginTop='8px';
      controls.innerHTML='<input type="file" id="'+id+'" accept=".csv,.tsv,.txt,.ods" style="margin-bottom:8px;"><button type="button" class="add-btn" data-action="mot-upload" data-source="'+source+'">'+(currentImport(source)?'Replace file':'Upload file')+'</button>';
      card.appendChild(controls);
    }
    if(currentImport(source)&&!card.querySelector('[data-mot-import-delete-neil="'+source+'"]')){
      const upload=card.querySelector('[data-action="mot-upload"][data-source="'+source+'"]');
      if(upload)upload.insertAdjacentHTML('afterend','<button type="button" class="add-btn" data-mot-import-delete-neil="'+source+'" style="border-color:var(--red);color:var(--red);margin-left:6px;">Clear / Delete</button>');
    }
  });
  return w.innerHTML;
}
async function upload(source){
  if(busy||!isNeil())return;
  const input=document.getElementById(source==='mot_system'?'mot-system-file':'mot-autowork-file'),file=input&&input.files&&input.files[0];
  if(!file){showToast('Choose the file first.',true);return;}
  busy=true;showToast('Reading '+file.name+'…');
  try{
    const matrix=await motReadFile(file);
    const rows=source==='mot_system'?motParseSystem(matrix,file.name):motParseAutowork(matrix,file.name);
    if(!rows.length)throw new Error(source==='mot_system'?'No MOT test rows were found. Check this is the MOT testing-station export.':'No MOT invoice rows were found. Check this is the Autowork export.');
    if(rows.length>10000)throw new Error('This file has too many rows. Export one month at a time.');
    const month=motReportMonth(rows);if(!month)throw new Error('The month could not be read from the file.');
    const payload={source:source,report_month:month+'-01',file_name:String(file.name||'').slice(0,240),row_count:rows.length,rows:rows,uploaded_by:NEIL,uploaded_at:new Date().toISOString()};
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_imports?on_conflict=source,report_month',{method:'POST',headers:Object.assign(await authHeaders(),{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(payload)});
    if(!res.ok){let d={};try{d=await res.json();}catch(_e){}throw new Error(d.message||('Upload failed ('+res.status+')'));}
    state.admin.motImports=null;state.admin.motMonth=month;await loadMotImports(true);
    showToast(rows.length+' '+(source==='mot_system'?'MOT test':'Autowork MOT invoice')+' rows loaded for '+salesAnalysisMonthLabel(month)+'.');
    if(typeof render==='function')render();
  }catch(err){showToast(err&&err.message?err.message:'The file could not be loaded.',true);}
  finally{busy=false;}
}
async function removeImport(source){
  if(busy||!isNeil())return;
  const rec=currentImport(source);if(!rec){showToast('That MOT file is no longer loaded.',true);return;}
  const label=source==='mot_system'?'MOT testing-station log':'Autowork MOT invoices';
  if(!window.confirm('Delete the '+label+' for '+monthLabel(currentMonth())+'?\n\nThe comparison will update immediately.'))return;
  busy=true;
  try{
    const h=await authHeaders();h['Prefer']='return=minimal';
    const res=await fetch(SUPABASE_URL+'/rest/v1/mot_imports?id=eq.'+encodeURIComponent(rec.id),{method:'DELETE',headers:h});
    if(!res.ok){let msg='Delete failed ('+res.status+')';try{const d=await res.json();msg=d.message||msg;}catch(_){}throw new Error(msg);}
    state.admin.motImports=null;await loadMotImports(true);showToast(label+' cleared for '+monthLabel(currentMonth())+'.');if(typeof render==='function')render();
  }catch(err){showToast(err&&err.message?err.message:'Could not delete the MOT file.',true);}
  finally{busy=false;}
}
window.addEventListener('click',function(ev){
  if(!isNeil())return;
  const uploadBtn=ev.target&&ev.target.closest?ev.target.closest('[data-action="mot-upload"]'):null;
  if(uploadBtn){ev.preventDefault();ev.stopImmediatePropagation();upload(uploadBtn.getAttribute('data-source'));return;}
  const delBtn=ev.target&&ev.target.closest?ev.target.closest('[data-mot-import-delete-neil]'):null;
  if(delBtn){ev.preventDefault();ev.stopImmediatePropagation();removeImport(delBtn.getAttribute('data-mot-import-delete-neil'));}
},true);
setTimeout(function(){try{const old=renderAdmin;renderAdmin=function(){return patch(old());};if(state.admin&&state.admin.authed&&state.admin.tab===TAB&&isNeil())render();}catch(err){console.error('Neil MOT upload access setup failed',err);}},0);
})();
