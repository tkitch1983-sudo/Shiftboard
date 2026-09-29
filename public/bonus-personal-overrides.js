(function(){
  'use strict';

  function isTony(){
    try{return typeof isTonyLogin==='function'&&isTonyLogin();}catch(_e){return false;}
  }
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function money(v){
    try{if(typeof bonusMoney==='function')return bonusMoney(v);}catch(_e){}
    const n=Number(v||0);
    return '£'+(Number.isFinite(n)?n:0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function currentDraft(){
    try{
      const month=(state&&state.admin&&state.admin.bonusMonth)||new Date().toISOString().slice(0,7);
      return typeof bonusMonthData==='function'?bonusMonthData(month):null;
    }catch(_e){return null;}
  }
  function validOverride(raw){
    raw=String(raw==null?'':raw).trim();
    return raw!==''&&Number.isFinite(Number(raw));
  }
  function patchCard(html,anchorId,inputId,key,label){
    const anchor='id="'+anchorId+'"';
    const from=html.indexOf(anchor);
    if(from<0)return html;
    const marker='<div style="font-size:23px;font-weight:800;margin-top:10px;">';
    const start=html.indexOf(marker,from);
    if(start<0)return html;
    const contentStart=start+marker.length;
    const end=html.indexOf('</div>',contentStart);
    if(end<0)return html;
    const calculated=html.slice(contentStart,end);
    const draft=currentDraft()||{};
    const raw=String(draft[key]??'');
    const hasOverride=validOverride(raw);
    const finalText=hasOverride?money(Number(raw)):calculated;
    const control='<label class="no-print" style="display:block;margin-top:10px;font-size:11px;color:var(--muted);">'+label+'<input id="'+inputId+'" type="number" step="0.01" placeholder="Use calculated" value="'+esc(raw)+'" style="width:135px;margin-left:8px;"></label>'+
      '<div style="font-size:10px;color:var(--muted-2);margin-top:5px;">'+(hasOverride?'Automatic calculation '+calculated+' · manual final bonus in use':'Leave blank to use the automatic calculation.')+'</div>';
    html=html.slice(0,start)+control+html.slice(start);
    const shiftedStart=start+control.length+marker.length;
    const shiftedEnd=html.indexOf('</div>',shiftedStart);
    return html.slice(0,shiftedStart)+finalText+html.slice(shiftedEnd);
  }
  function applyOverrides(html){
    if(!isTony()||typeof html!=='string')return html;
    html=patchCard(html,'bonus-tony-adjustment','bonus-tony-override','tonyOverride','Final bonus override');
    html=patchCard(html,'bonus-neil-owed','bonus-neil-override','neilOverride','Final bonus override');
    return html;
  }

  try{
    if(typeof renderAdminBonus==='function'){
      const previous=renderAdminBonus;
      renderAdminBonus=function(){return applyOverrides(previous.apply(this,arguments));};
      try{window.renderAdminBonus=renderAdminBonus;}catch(_e){}
    }
  }catch(_e){}

  document.addEventListener('click',function(e){
    if(!isTony())return;
    const btn=e.target&&e.target.closest?e.target.closest('[data-action="save-bonus"]'):null;
    if(!btn)return;
    const draft=currentDraft();
    if(!draft)return;
    const t=document.getElementById('bonus-tony-override');
    const n=document.getElementById('bonus-neil-override');
    if(t)draft.tonyOverride=String(t.value||'').trim();
    if(n)draft.neilOverride=String(n.value||'').trim();
  },true);
})();
