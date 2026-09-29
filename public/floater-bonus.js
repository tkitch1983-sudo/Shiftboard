(function(){
'use strict';

const isTony=()=>{try{return typeof isTonyLogin==='function'&&isTonyLogin()}catch(_e){return false}};
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0};
const money=v=>{try{if(typeof bonusMoney==='function')return bonusMoney(v)}catch(_e){}return '£'+num(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})};
const order=['peterlee','middlesbrough','fairfield','chester','gateshead','seaham','hartlepool','lido'];

function monthValue(){
 try{return (state&&state.admin&&state.admin.bonusMonth)||new Date().toISOString().slice(0,7)}catch(_e){return new Date().toISOString().slice(0,7)}
}
function monthDraft(month){
 try{return typeof bonusMonthData==='function'?bonusMonthData(month):null}catch(_e){return null}
}
function floaterData(month){
 const d=monthDraft(month);if(!d)return {sites:{},adjustment:'',note:''};
 if(!d.floaterMLanglands||typeof d.floaterMLanglands!=='object')d.floaterMLanglands={sites:{},adjustment:'',note:''};
 if(!d.floaterMLanglands.sites||typeof d.floaterMLanglands.sites!=='object')d.floaterMLanglands.sites={};
 return d.floaterMLanglands;
}
function labelFor(key){
 try{return BONUS_SITE_RULES[key]&&BONUS_SITE_RULES[key].label?BONUS_SITE_RULES[key].label:key}catch(_e){return key}
}
function totalFromData(data){
 let total=num(data.adjustment);
 order.forEach(key=>{total+=num((data.sites[key]||{}).amount)});
 return total;
}
function tabButton(id,label,mode){
 return '<button type="button" data-bonus-view="'+id+'" style="padding:9px 14px;border:1px solid '+(mode===id?'var(--amber)':'var(--line)')+';background:'+(mode===id?'var(--amber-dim)':'var(--panel-2)')+';color:var(--text);cursor:pointer;font-weight:700;">'+label+'</button>';
}
function tabs(mode){
 return '<div class="no-print" style="display:flex;gap:7px;margin-bottom:16px;flex-wrap:wrap;">'+tabButton('sheet','Bonus Sheet',mode)+tabButton('levels','Bonus Levels',mode)+tabButton('floater','M Langlands — Floater',mode)+'</div>';
}
function row(key,data){
 const item=data.sites[key]||{};
 return '<tr><td style="font-weight:700;">'+esc(labelFor(key))+'</td><td><input type="number" step="0.01" inputmode="decimal" data-floater-amount="'+esc(key)+'" value="'+esc(item.amount||'')+'" placeholder="0.00" style="width:130px;"></td><td><input type="text" data-floater-note="'+esc(key)+'" value="'+esc(item.note||'')+'" placeholder="e.g. cover worked / agreed amount" style="width:100%;min-width:260px;"></td></tr>';
}
function page(){
 const month=monthValue(),data=floaterData(month),total=totalFromData(data);
 const titleDate=new Date(month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 return tabs('floater')+
 '<div id="bonus-floater-mlanglands">'+
 '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px;"><div><h2>M Langlands — Floater Bonus</h2><div class="head-sub" style="margin-bottom:0;">Separate monthly floater bonus sheet. Enter the agreed amount against each site covered.</div></div><div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;"><label style="font-size:11px;color:var(--muted);">Month<input id="floater-bonus-month" type="month" value="'+esc(month)+'" style="display:block;margin-top:4px;width:auto;"></label><button type="button" class="add-btn" data-action="save-floater-bonus">Save Floater Sheet</button><button type="button" class="add-btn secondary" data-action="print-floater-bonus">Print A4</button></div></div>'+
 '<div class="card" style="border-left:4px solid var(--amber);"><b>'+esc(titleDate)+'</b><div style="font-size:12px;color:var(--muted);margin-top:4px;">M Langlands · Floater. Amounts are manual so no unconfirmed site rule is imposed.</div></div>'+
 '<div class="card" style="padding:0;overflow:visible;"><table id="floater-bonus-table" style="width:100%;min-width:0;"><thead><tr><th style="width:24%;">Site</th><th style="width:20%;">Bonus amount</th><th>Notes</th></tr></thead><tbody>'+order.map(k=>row(k,data)).join('')+'</tbody></table></div>'+
 '<div class="card" style="display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr);gap:14px;align-items:end;">'+
 '<label style="font-size:11px;color:var(--muted);">Final adjustment / other<input id="floater-adjustment" type="number" step="0.01" inputmode="decimal" value="'+esc(data.adjustment||'')+'" placeholder="0.00" style="display:block;width:160px;margin-top:4px;"></label>'+
 '<div style="text-align:right;"><div style="font-size:11px;color:var(--muted);">TOTAL FLOATER BONUS</div><div id="floater-total" style="font-size:28px;font-weight:800;">'+money(total)+'</div></div></div>'+
 '<div class="card"><label style="font-size:11px;color:var(--muted);">Month notes<textarea id="floater-month-note" rows="3" placeholder="Any overall note for this month" style="display:block;width:100%;margin-top:5px;">'+esc(data.note||'')+'</textarea></label></div>'+
 '</div>';
}
function addFloaterTab(html){
 if(typeof html!=='string'||html.includes('data-bonus-view="floater"'))return html;
 const marker='data-bonus-view="levels"';
 const at=html.indexOf(marker);if(at<0)return html;
 const end=html.indexOf('</button>',at);if(end<0)return html;
 return html.slice(0,end+9)+tabButton('floater','M Langlands — Floater',window.__bonusTonyView||'sheet')+html.slice(end+9);
}
function capture(){
 const month=monthValue(),data=floaterData(month);if(!data)return null;
 document.querySelectorAll('[data-floater-amount]').forEach(input=>{const key=input.dataset.floaterAmount;data.sites[key]=data.sites[key]||{};data.sites[key].amount=String(input.value||'').trim()});
 document.querySelectorAll('[data-floater-note]').forEach(input=>{const key=input.dataset.floaterNote;data.sites[key]=data.sites[key]||{};data.sites[key].note=String(input.value||'').trim()});
 const adj=document.getElementById('floater-adjustment');if(adj)data.adjustment=String(adj.value||'').trim();
 const note=document.getElementById('floater-month-note');if(note)data.note=String(note.value||'').trim();
 data.updatedAt=Date.now();
 try{data.updatedBy=String(_session&&_session.email||'')}catch(_e){}
 return data;
}
function refreshTotal(){
 const el=document.getElementById('floater-total');if(!el)return;
 let total=num((document.getElementById('floater-adjustment')||{}).value);
 document.querySelectorAll('[data-floater-amount]').forEach(input=>{total+=num(input.value)});
 el.textContent=money(total);
}

try{
 if(typeof renderAdminBonus==='function'){
   const previous=renderAdminBonus;
   renderAdminBonus=function(){
     if(!isTony())return previous.apply(this,arguments);
     if(window.__bonusTonyView==='floater')return page();
     return addFloaterTab(previous.apply(this,arguments));
   };
   try{window.renderAdminBonus=renderAdminBonus}catch(_e){}
 }
}catch(_e){}

document.addEventListener('click',async function(e){
 if(!isTony())return;
 const floaterTab=e.target&&e.target.closest?e.target.closest('[data-bonus-view="floater"]'):null;
 if(floaterTab){e.preventDefault();e.stopImmediatePropagation();window.__bonusTonyView='floater';try{if(typeof render==='function')render()}catch(_e){}return;}
 const btn=e.target&&e.target.closest?e.target.closest('[data-action]'):null;if(!btn)return;
 const action=String(btn.dataset.action||'');
 if(action==='save-floater-bonus'){
   e.preventDefault();e.stopImmediatePropagation();capture();
   let ok=false;try{ok=await saveBonusSheets()}catch(_e){}
   try{if(typeof showToast==='function')showToast(ok?'Floater bonus sheet saved.':'Floater bonus sheet could not be saved.',!ok)}catch(_e){}
   try{if(typeof render==='function')render()}catch(_e){}
   return;
 }
 if(action==='print-floater-bonus'){
   e.preventDefault();e.stopImmediatePropagation();capture();refreshTotal();
   const month=monthValue();
   try{if(typeof printSelectedReport==='function')printSelectedReport('#bonus-floater-mlanglands','M Langlands Floater Bonus '+month,'portrait')}catch(_e){}
 }
},true);

document.addEventListener('input',function(e){
 if(!isTony())return;
 if(e.target&&e.target.matches&&e.target.matches('[data-floater-amount],#floater-adjustment'))refreshTotal();
},true);

document.addEventListener('change',function(e){
 if(!isTony()||!e.target||e.target.id!=='floater-bonus-month')return;
 const value=String(e.target.value||'').trim();if(!/^\d{4}-\d{2}$/.test(value))return;
 try{state.admin.bonusMonth=value}catch(_e){}
 try{if(typeof render==='function')render()}catch(_e){}
},true);

try{
 if(typeof selectedReportHtml==='function'){
   const previousReport=selectedReportHtml;
   selectedReportHtml=function(selector,title,orientation){
     let out=previousReport.apply(this,arguments);
     if(!out||String(selector)!=='#bonus-floater-mlanglands')return out;
     const css='<style>@page{size:A4 portrait!important;margin:10mm!important}body{font-size:10px!important}.card{margin-bottom:5mm!important;padding:8px!important;overflow:visible!important}table{width:100%!important;min-width:0!important;font-size:9px!important}th,td{padding:5px!important}.no-print{display:none!important}.report-field-value{font-size:9px!important}</style>';
     return out.replace('</head>',css+'</head>');
   };
   try{window.selectedReportHtml=selectedReportHtml}catch(_e){}
 }
}catch(_e){}
})();
