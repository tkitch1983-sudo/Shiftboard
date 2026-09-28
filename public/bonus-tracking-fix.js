(function(){
'use strict';
const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0};
function fixedAddOn(s){if(!s)return 0;const t=num(s.tracking);return(t>=50?t*2:t)+num(s.pollen)+num(s.bfc)+num(s.diag)+num(s.coolant)+num(s.ac)}
try{window.bonusAddOn=fixedAddOn}catch(_e){} try{bonusAddOn=fixedAddOn}catch(_e){}
const cash=v=>'£'+num(v).toLocaleString('en-GB',{maximumFractionDigits:0});
const tony=()=>{try{return typeof isTonyLogin==='function'&&isTonyLogin()}catch(_e){return false}};
const extras={
 middlesbrough:['T Hope',[[110000,200],[120000,250],[130000,300],[140000,400],[150000,500],[160000,600]]],
 fairfield:['M McCormick',[[85000,250],[90000,300],[95000,350],[100000,400]]],
 chester:['S Jauncey',[[80000,100],[90000,200],[100000,300]]],
 gateshead:['S Gibson',[[100000,300],[110000,400],[120000,500],[130000,600],[140000,700]]]
};
function chips(start,base,count){
 if(start==null)return '<span style="color:var(--amber)">Not set</span>';
 let a=['Below '+cash(start)+' = £0'];
 for(let i=0;i<count;i++)a.push(cash(start+i*5000)+' = '+cash(base+i*50));
 return a.map(x=>'<span style="display:inline-block;padding:5px 7px;margin:2px;border:1px solid var(--line);background:var(--panel-2);font-size:11px;">'+x+'</span>').join('')+
 '<div style="font-size:10px;color:var(--muted);margin-top:5px;">Then +£50 for every complete £5,000 above — uncapped.</div>';
}
function manager(key){
 const x=extras[key];if(!x)return '<span style="color:var(--muted-2)">None set</span>';
 return '<b>'+x[0]+'</b><div style="margin-top:4px;">'+x[1].map(r=>cash(r[0])+' → '+cash(r[1])).join(' · ')+'</div>';
}
function site(key,r){
 const d=r.davantiTarget==null?'Not set':('Below '+r.davantiTarget+' = £0 · '+r.davantiTarget+' = £50 · '+(r.davantiTarget+1)+' = £52 · '+(r.davantiTarget+10)+' = £70 · then +£2 each');
 return '<div class="card" style="border-left:4px solid var(--amber);">'+
 '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><div style="font-family:Oswald,sans-serif;font-size:20px;font-weight:700;">'+r.label+'</div>'+
 '<div style="font-size:10px;color:'+(r.groupActive===false?'var(--amber)':'var(--green)')+';">'+(r.groupActive===false?'Excluded from group totals':'Included in group totals')+'</div></div>'+
 '<div style="font-size:11px;color:var(--muted);">Davanti target <b style="color:var(--text);">'+(r.davantiTarget==null?'—':r.davantiTarget)+'</b></div></div>'+
 '<div style="margin-top:12px;"><b style="font-size:11px;">STAFF TURNOVER LEVELS</b><div style="margin-top:5px;">'+chips(r.staffStart,r.staffBase,11)+'</div></div>'+
 '<div style="margin-top:12px;"><b style="font-size:11px;">DAVANTI</b><div style="font-size:11px;color:var(--muted);margin-top:4px;">'+d+' — full amount to each receptionist, not split.</div></div>'+
 '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:12px;">'+
 '<div><b style="font-size:11px;">TONY SITE-SALES LEVELS</b><div style="margin-top:4px;">'+chips(r.tonyStart,r.tonyBase,5)+'</div></div>'+
 '<div><b style="font-size:11px;">SPECIAL MANAGER EXTRA</b><div style="font-size:11px;color:var(--muted);margin-top:4px;">'+manager(key)+'</div></div>'+
 '</div></div>';
}
function levels(){
 let rules={};try{rules=BONUS_SITE_RULES}catch(_e){}
 const order=['peterlee','middlesbrough','fairfield','chester','gateshead','seaham','hartlepool','lido'];
 return '<h2>Bonus Levels</h2><div class="head-sub">Tony-only view of the bonus levels currently coded into Shiftboard. Read only.</div>'+
 '<div class="card"><b>Shared rules</b><div style="font-size:12px;color:var(--muted);margin-top:7px;line-height:1.7;">Tracking 0–49 = £1 each · at 50+ every tracking = £2 · BFC, Coolant, Pollen, A/C and Diagnostics = £1 each · add-on pot split equally between reception · Davanti paid in full to each receptionist.</div></div>'+
 order.filter(k=>rules[k]).map(k=>site(k,rules[k])).join('')+
 '<div class="card"><b>Group / personal rules</b><div style="font-size:12px;color:var(--muted);margin-top:7px;line-height:1.7;">Tony Davanti: 600 = £100, then +£25 per complete 25 units; Gateshead excluded. · Neil turnover: £500,000 = £700, then +£25 per complete £25,000. · Neil Davanti: 550 = £100, then +£25 per complete 25 units. · More than 2 weekday sick days removes the bonus; otherwise the base has a daily sick deduction.</div></div>';
}
function tabs(mode){
 const b=(id,label)=>'<button type="button" data-bonus-view="'+id+'" style="padding:9px 14px;border:1px solid '+(mode===id?'var(--amber)':'var(--line)')+';background:'+(mode===id?'var(--amber-dim)':'var(--panel-2)')+';color:var(--text);cursor:pointer;font-weight:700;">'+label+'</button>';
 return '<div class="no-print" style="display:flex;gap:7px;margin-bottom:16px;">'+b('sheet','Bonus Sheet')+b('levels','Bonus Levels')+'</div>';
}
try{
 if(typeof renderAdminBonus==='function'){
  const original=renderAdminBonus;
  renderAdminBonus=function(){
   if(!tony())return original.apply(this,arguments);
   const mode=window.__bonusTonyView==='levels'?'levels':'sheet';
   return tabs(mode)+(mode==='levels'?levels():original.apply(this,arguments));
  };
  try{window.renderAdminBonus=renderAdminBonus}catch(_e){}
 }
}catch(_e){}
document.addEventListener('click',e=>{
 const b=e.target&&e.target.closest?e.target.closest('[data-bonus-view]'):null;
 if(!b||!tony())return;
 e.preventDefault();window.__bonusTonyView=b.getAttribute('data-bonus-view')==='levels'?'levels':'sheet';
 try{if(typeof render==='function')render()}catch(_e){}
});
})();