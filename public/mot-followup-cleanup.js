(function(){
'use strict';
const TAB='mot';
const ATTENTION_LABELS=new Set(['Missing invoice','Duplicate invoice','Credited / £0','Autowork only','Additional invoice']);
function colIndex(table,re){return Array.from(table.querySelectorAll('thead th')).findIndex(th=>re.test(String(th.textContent||'').trim()));}
function rowReg(tr,table){const i=colIndex(table,/^Registration$/i);return i>=0?String(tr.children[i]?.textContent||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''):'';}
function rowInvoiceCell(tr,table){const i=colIndex(table,/Invoice check/i);return i>=0?tr.children[i]:null;}
function rowExplanationCell(tr,table){const i=colIndex(table,/Explanation/i);return i>=0?tr.children[i]:null;}
function isDoneRow(tr){const cb=tr.querySelector('[data-mot-actioned]');if(cb&&cb.checked)return true;const t=String(tr.lastElementChild?.textContent||'').toUpperCase();return t.includes('DONE');}
function motRegs(){
 try{return new Set((typeof motReconciliation==='function'?motReconciliation():[]).filter(r=>Number(r.tests||0)>0).map(r=>String(r.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'')));}
 catch(_){return new Set();}
}
function markRow(tr,table,regs){
 const cell=rowInvoiceCell(tr,table);if(!cell)return;
 const original=String(cell.textContent||'').trim(),reg=rowReg(tr,table);
 if(original==='Autowork only'&&reg&&regs.has(reg)){
   cell.innerHTML='<span style="color:var(--red);font-weight:700;">Additional invoice</span>';
   const ex=rowExplanationCell(tr,table);if(ex)ex.textContent='Additional Autowork MOT invoice for a registration already present on the MOT log';
 }
 if(isDoneRow(tr)){
   cell.innerHTML='<span style="color:var(--green);font-weight:800;">FIXED</span>';
   tr.setAttribute('data-mot-fixed','1');
 }
}
function patchMot(root){
 const regs=motRegs();
 const tables=Array.from(root.querySelectorAll('table')).filter(t=>colIndex(t,/Invoice check/i)>=0);
 tables.forEach(table=>Array.from(table.querySelectorAll('tbody tr')).forEach(tr=>markRow(tr,table,regs)));
 const printTable=root.querySelector('#mot-admin-print table');
 let unresolved=0;
 if(printTable){
   Array.from(printTable.querySelectorAll('tbody tr')).forEach(tr=>{
     const c=rowInvoiceCell(tr,printTable),label=String(c?.textContent||'').trim();
     if(ATTENTION_LABELS.has(label))unresolved++;
   });
 }
 const needCard=Array.from(root.querySelectorAll('.card')).find(c=>/^Needs attention/i.test(String(c.textContent||'').trim())&&c.querySelector('.mono'));
 if(needCard){const n=needCard.querySelector('.mono');if(n)n.textContent=String(unresolved);const summary=needCard.querySelector('[data-mot-action-summary]');if(summary)summary.textContent=unresolved+' outstanding';}
 if(state.admin&&state.admin.motFilter==='attention'){
   const live=tables.find(t=>!t.closest('#mot-admin-print'));
   if(live){
     Array.from(live.querySelectorAll('tbody tr[data-mot-fixed="1"]')).forEach(tr=>tr.remove());
     const body=live.querySelector('tbody');if(body&&!body.querySelector('tr'))body.innerHTML='<tr><td colspan="'+live.querySelectorAll('thead th').length+'" class="empty-state">No outstanding MOT actions.</td></tr>';
   }
 }
}
function simplifyRegister(root){
 const reg=root.querySelector('[data-q-register]');if(!reg)return;
 const sub=reg.querySelector('h3+div');if(sub)sub.textContent='Keep each site as IN PROGRESS until its monthly MOT QC is finished, then tick Done.';
 const info=Array.from(reg.querySelectorAll('div')).find(d=>/Save progress today, then revisit it/i.test(d.textContent||''));if(info)info.innerHTML='<b style="color:var(--text)">Simple monthly status.</b> Save as <b>IN PROGRESS</b> while you are still checking the month. Tick <b>Done</b> when that site is complete.';
 const table=reg.querySelector('table');if(!table)return;
 const head=table.querySelector('thead tr');if(head){const hs=Array.from(head.children);if(hs[4])hs[4].textContent='Done';if(hs[3])hs[3].remove();if(hs[2])hs[2].remove();}
 Array.from(table.querySelectorAll('tbody tr')).forEach(tr=>{const td=Array.from(tr.children);if(td[3])td[3].remove();if(td[2])td[2].remove();});
 table.style.minWidth='720px';
}
function patch(html){
 if(!state||!state.admin||state.admin.tab!==TAB)return html;
 const wrap=document.createElement('div');wrap.innerHTML=html;const root=wrap.querySelector('.admin-main');if(!root)return html;
 patchMot(root);simplifyRegister(root);return wrap.innerHTML;
}
setTimeout(function(){
 try{const old=renderAdmin;renderAdmin=function(){return patch(old());};if(state.admin&&state.admin.authed&&state.admin.tab===TAB)render();}
 catch(err){console.error('MOT follow-up cleanup failed',err);}
},0);
})();
