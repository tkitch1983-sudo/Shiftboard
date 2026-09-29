(function(){
  'use strict';

  const money=v=>{
    try{ if(typeof bonusMoney==='function') return bonusMoney(v); }catch(_e){}
    const n=Number(v||0); return '£'+(Number.isFinite(n)?n:0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const html=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const isTony=()=>{ try{return typeof isTonyLogin==='function'&&isTonyLogin();}catch(_e){return false;} };
  const monthNow=()=>{ try{return (state&&state.admin&&state.admin.bonusMonth)||new Date().toISOString().slice(0,7);}catch(_e){return new Date().toISOString().slice(0,7);} };
  const draftFor=month=>{ try{return typeof bonusMonthData==='function'?bonusMonthData(month):null;}catch(_e){return null;} };

  // Lido uses the same site bonus levels as Seaham. Group inclusion remains
  // unchanged because that is a separate Neil/group rule rather than a site level.
  try{
    if(typeof BONUS_SITE_RULES!=='undefined' && BONUS_SITE_RULES.seaham && BONUS_SITE_RULES.lido){
      const s=BONUS_SITE_RULES.seaham, l=BONUS_SITE_RULES.lido;
      l.staffStart=s.staffStart;
      l.staffBase=s.staffBase;
      l.davantiTarget=s.davantiTarget;
      l.tonyStart=s.tonyStart;
      l.tonyBase=s.tonyBase;
    }
  }catch(_e){}

  function predictionRaw(month,key){
    const d=draftFor(month);
    return d&&d.sitePredictions&&d.sitePredictions[key]!=null?String(d.sitePredictions[key]):'';
  }
  function validPrediction(raw){
    raw=String(raw==null?'':raw).trim();
    return raw!=='' && Number.isFinite(Number(raw)) && Number(raw)>=0;
  }

  // Apply Tony's saved month-end sales prediction to the calculation snapshot.
  try{
    if(typeof bonusSnapshotsForMonth==='function'){
      const originalSnapshots=bonusSnapshotsForMonth;
      bonusSnapshotsForMonth=function(month){
        const base=originalSnapshots.apply(this,arguments)||{};
        const out={};
        Object.keys(base).forEach(k=>{ out[k]=base[k]&&typeof base[k]==='object'?Object.assign({},base[k]):base[k]; });
        const d=draftFor(month)||{}, preds=d.sitePredictions||{};
        Object.keys(preds).forEach(key=>{
          const raw=String(preds[key]==null?'':preds[key]).trim();
          if(!validPrediction(raw)) return;
          const snap=out[key]&&typeof out[key]==='object'?out[key]:{};
          snap.total_current=Number(raw);
          snap.manualPrediction=true;
          snap.projected=true;
          out[key]=snap;
        });
        return out;
      };
      try{window.bonusSnapshotsForMonth=bonusSnapshotsForMonth;}catch(_e){}
    }
  }catch(_e){}

  // Do not pace-project a figure Tony has explicitly entered as the month-end prediction.
  try{
    if(typeof bonusProjectSnapshot==='function'){
      const originalProject=bonusProjectSnapshot;
      bonusProjectSnapshot=function(snapshot,month){
        if(snapshot&&snapshot.manualPrediction) return snapshot;
        return originalProject.apply(this,arguments);
      };
      try{window.bonusProjectSnapshot=bonusProjectSnapshot;}catch(_e){}
    }
  }catch(_e){}

  function calcForSite(key,month){
    try{
      const rule=BONUS_SITE_RULES[key]; if(!rule) return null;
      const snaps=bonusSnapshotsForMonth(month)||{}, snap=snaps[key]||{};
      const sales=typeof bonusAmount==='function'?bonusAmount(snap.total_current):Number(snap.total_current||0);
      const units=typeof bonusAmount==='function'?bonusAmount(snap.davanti):Number(snap.davanti||0);
      const staffBonus=rule.staffStart==null?0:bonusTier(sales,rule.staffStart,rule.staffBase);
      const davantiBonus=rule.davantiTarget==null?0:bonusDavanti(units,rule.davantiTarget);
      const addOnBonus=typeof bonusAddOn==='function'?bonusAddOn(snap):0;
      return {siteKey:key,sales,staffBonus,davantiBonus,addOnBonus};
    }catch(_e){return null;}
  }
  function receptionCountFor(key){
    try{
      const site=state.config.sites.find(s=>bonusSiteKey(s.name)===key);
      if(!site) return 0;
      return state.config.employees.filter(e=>String(e.siteId)===String(site.id)&&e.active!==false&&bonusRole(e)==='reception').length;
    }catch(_e){return 0;}
  }
  function isLee(emp){
    const key=String(emp&&emp.name||'').toLowerCase().replace(/[^a-z]/g,'');
    return ['leehornsey','lhornsey','lhornsley','leehornsley'].includes(key);
  }
  function leeScheme(month){
    month=String(month||'');
    if(month>='2026-09' && month<'2027-01') return 'fairfield';
    if(month>='2027-01') return 'lido';
    return null;
  }

  // Lee follows Fairfield for Sep-Dec 2026, then Lido from Jan 2027 onward.
  try{
    if(typeof bonusEmployeeCalc==='function'){
      const originalEmployeeCalc=bonusEmployeeCalc;
      bonusEmployeeCalc=function(emp,siteCalc,month,draft,receptionCount){
        if(isLee(emp)){
          const key=leeScheme(month), replacement=key?calcForSite(key,month):null;
          if(replacement) return originalEmployeeCalc.call(this,emp,replacement,month,draft,receptionCountFor(key));
        }
        return originalEmployeeCalc.apply(this,arguments);
      };
      try{window.bonusEmployeeCalc=bonusEmployeeCalc;}catch(_e){}
    }
  }catch(_e){}

  function predictionControl(key,rule,month){
    const raw=predictionRaw(month,key), active=validPrediction(raw);
    return '<div class="card no-print bonus-prediction-control" data-prediction-site="'+html(key)+'" style="padding:10px 12px;margin:0 0 8px;border-left:3px solid '+(active?'var(--green)':'var(--line)')+';">'+
      '<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">'+
        '<label style="font-size:11px;color:var(--muted);"><b style="display:block;color:var(--text);margin-bottom:4px;">'+html(rule.label)+' — your predicted month-end sales</b><input type="number" min="0" step="100" data-bonus-prediction="'+html(key)+'" value="'+html(raw)+'" placeholder="Leave blank for actual / pace projection" style="width:230px;padding:8px;"></label>'+
        '<button type="button" class="add-btn" data-action="apply-bonus-prediction" data-site="'+html(key)+'" style="padding:8px 12px;">Update calculation</button>'+
        '<span style="font-size:10px;color:var(--muted-2);">'+(active?'Using '+money(Number(raw))+' for turnover calculations.':'No manual prediction set.')+'</span>'+
      '</div></div>';
  }

  function capturePredictionInputs(){
    const month=monthNow(), d=draftFor(month); if(!d) return false;
    if(!d.sitePredictions||typeof d.sitePredictions!=='object') d.sitePredictions={};
    let changed=false;
    document.querySelectorAll('[data-bonus-prediction]').forEach(input=>{
      const key=String(input.dataset.bonusPrediction||''), raw=String(input.value||'').trim();
      if(!key) return;
      const before=String(d.sitePredictions[key]??'');
      if(raw===''){
        if(Object.prototype.hasOwnProperty.call(d.sitePredictions,key)){ delete d.sitePredictions[key]; changed=true; }
      }else if(validPrediction(raw)){
        if(before!==raw){ d.sitePredictions[key]=raw; changed=true; }
      }
    });
    return changed;
  }

  function addPredictionUi(rendered){
    if(!isTony()||typeof rendered!=='string') return rendered;
    const month=monthNow();
    try{
      Object.entries(BONUS_SITE_RULES).forEach(([key,rule])=>{
        const needle='<div class="card" id="bonus-site-'+key+'"';
        const at=rendered.indexOf(needle);
        if(at>=0) rendered=rendered.slice(0,at)+predictionControl(key,rule,month)+rendered.slice(at);
      });
    }catch(_e){}
    if(rendered.includes('<h2>Bonus Levels</h2>')){
      rendered+='<div class="card" style="border-left:4px solid var(--green);"><b>2026/27 transition</b><div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.6;">Lido uses the same staff, Davanti and Tony site-sales bonus levels as Seaham. Lee Hornsey follows Fairfield bonus calculations from September through December 2026, then Lido calculations from January 2027 onward.</div></div>';
    }
    return rendered;
  }

  try{
    if(typeof renderAdminBonus==='function'){
      const previousRender=renderAdminBonus;
      renderAdminBonus=function(){ return addPredictionUi(previousRender.apply(this,arguments)); };
      try{window.renderAdminBonus=renderAdminBonus;}catch(_e){}
    }
  }catch(_e){}

  document.addEventListener('click',function(e){
    if(!isTony()) return;
    const button=e.target&&e.target.closest?e.target.closest('[data-action]'):null;
    if(!button) return;
    const action=String(button.dataset.action||'');
    if(action==='apply-bonus-prediction'){
      e.preventDefault(); e.stopImmediatePropagation();
      capturePredictionInputs();
      try{if(typeof render==='function') render();}catch(_e){}
      return;
    }
    if(action==='save-bonus'){
      capturePredictionInputs();
      return;
    }
    if(['bonus-print','bonus-download','bonus-site-print','bonus-site-download','bonus-person-print','bonus-person-download'].includes(action)){
      const changed=capturePredictionInputs();
      if(changed){
        e.preventDefault(); e.stopImmediatePropagation();
        const site=button.dataset.site||'', person=button.dataset.person||'';
        try{if(typeof render==='function') render();}catch(_e){}
        window.setTimeout(()=>{
          let q='[data-action="'+action+'"]';
          if(site) q+='[data-site="'+site+'"]';
          if(person) q+='[data-person="'+person+'"]';
          const next=document.querySelector(q); if(next) next.click();
        },0);
      }
    }
  },true);

  // Compact bonus reports so site and monthly sheets fit A4 landscape cleanly.
  try{
    if(typeof selectedReportHtml==='function'){
      const originalReportHtml=selectedReportHtml;
      selectedReportHtml=function(selector,title,orientation){
        let out=originalReportHtml.apply(this,arguments);
        const sel=String(selector||'');
        if(!out || !(sel==='#bonus-sheet-output'||sel.indexOf('#bonus-site-')===0)) return out;
        const css='<style id="bonus-a4-fit">'+
          '@page{size:A4 landscape!important;margin:6mm!important}'+
          'body{font-size:8px!important;max-width:100%!important}'+
          '.card{margin:0 0 4mm!important;padding:6px!important;overflow:visible!important;max-width:100%!important}'+
          'table{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:auto!important;font-size:7px!important}'+
          'th,td{padding:2px 2px!important;white-space:normal!important;line-height:1.15!important}'+
          '.screen-role-col{display:none!important}.no-print{display:none!important}'+
          '.report-field-value{font-size:7px!important;white-space:normal!important}'+
          '#bonus-sheet-output>[id^="bonus-site-"]{break-before:page!important;page-break-before:always!important;break-inside:avoid-page!important;page-break-inside:avoid!important}'+
          '[id^="bonus-site-"]{overflow:visible!important;max-width:100%!important}'+
          '[id^="bonus-site-"] table{min-width:0!important;width:100%!important}'+
          '</style>';
        return out.replace('</head>',css+'</head>');
      };
      try{window.selectedReportHtml=selectedReportHtml;}catch(_e){}
    }
  }catch(_e){}
})();
