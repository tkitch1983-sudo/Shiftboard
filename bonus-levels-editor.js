(function bonusEditorMain(){
  'use strict';
  if (window.ShiftboardBonusLevels) return;

  const siteKeys=['peterlee','middlesbrough','fairfield','chester','gateshead','seaham','hartlepool','lido'];
  const currentMonth=()=>new Date().toISOString().slice(0,7);
  const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const escapeHtml=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const money=value=>'£'+Number(value||0).toLocaleString('en-GB',{maximumFractionDigits:2});
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const siteFields=['staffStart','staffBase','staffStepSales','staffStepPay','davantiTarget','davantiBase','davantiExtra','tonyStart','tonyBase','tonyStepSales','tonyStepPay'];
  const defaults={};
  siteKeys.forEach(key=>{
    // Lido's initial figures match the old Seaham-based scheme, but can now be saved separately.
    const rule=key==='lido'?BONUS_SITE_RULES.seaham:BONUS_SITE_RULES[key];
    defaults[key]={
      label:BONUS_SITE_RULES[key].label,
      staffStart:rule.staffStart,staffBase:rule.staffBase,staffStepSales:5000,staffStepPay:50,
      davantiTarget:rule.davantiTarget,davantiBase:50,davantiExtra:2,
      tonyStart:rule.tonyStart,tonyBase:rule.tonyBase,tonyStepSales:5000,tonyStepPay:50
    };
  });
  const managerDefaults={
    thope:{label:'T Hope · Middlesbrough',site:'middlesbrough',tiers:[[110000,200],[120000,250],[130000,300],[140000,400],[150000,500],[160000,600]]},
    mmccormick:{label:'M McCormick · Fairfield',site:'fairfield',tiers:[[85000,250],[90000,300],[95000,350],[100000,400]]},
    sjauncey:{label:'S Jauncey · Chester',site:'chester',tiers:[[80000,100],[90000,200],[100000,300]]},
    sgibson:{label:'S Gibson · Gateshead',site:'gateshead',tiers:[[100000,300],[110000,400],[120000,500],[130000,600],[140000,700]]}
  };
  const groupDefaults={
    tonyDavanti:{label:'Tony · group Davanti',threshold:600,base:100,step:25,stepPay:25},
    neilTurnover:{label:'Neil · group turnover',threshold:500000,base:700,step:25000,stepPay:25},
    neilDavanti:{label:'Neil · group Davanti',threshold:550,base:100,step:25,stepPay:25}
  };
  let editorMonth=currentMonth();
  function allVersions(){
    const raw=state.config&&state.config.bonusLevelVersions;
    return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  }
  function activeMonthKey(month){
    return Object.keys(allVersions()).filter(key=>monthPattern.test(key)&&key<=month).sort().pop()||'';
  }
  function active(month){
    month=monthPattern.test(String(month))?String(month):currentMonth();
    const result={sites:copy(defaults),managers:copy(managerDefaults),group:copy(groupDefaults)};
    const version=allVersions()[activeMonthKey(month)]||{};
    for(const key of siteKeys){
      const saved=version.sites&&version.sites[key];
      if(!saved||typeof saved!=='object') continue;
      for(const field of siteFields){
        if(key==='gateshead'&&field.startsWith('tony')) continue;
        if((field==='staffStart'||field==='tonyStart')&&saved[field]===null){result.sites[key][field]=null;continue;}
        if(saved[field]!==''&&saved[field]!==null&&Number.isFinite(Number(saved[field]))&&Number(saved[field])>=0){
          result.sites[key][field]=Number(saved[field]);
        }
      }
    }
    // Old saved schemes did not contain Lido. Preserve their historic Seaham-linked
    // result until a Tony-saved version explicitly gives Lido independent levels.
    if(!version.sites||!version.sites.lido||typeof version.sites.lido!=='object')
      result.sites.lido={...result.sites.seaham,label:'Lido'};
    result.sites.gateshead.tonyStart=null;
    result.sites.gateshead.tonyBase=0;
    for(const key of Object.keys(managerDefaults)){
      const arr=version.managers&&version.managers[key];
      if(Array.isArray(arr)) result.managers[key].tiers=arr.filter(t=>Array.isArray(t)&&t.length===2&&t.every(x=>Number.isFinite(Number(x))&&Number(x)>=0)).map(t=>t.map(Number)).sort((a,b)=>a[0]-b[0]);
    }
    for(const key of Object.keys(groupDefaults)){
      const saved=version.group&&version.group[key];
      if(!saved||typeof saved!=='object') continue;
      for(const field of ['threshold','base','step','stepPay']) if(saved[field]!==''&&saved[field]!==null&&Number.isFinite(Number(saved[field]))&&Number(saved[field])>=0) result.group[key][field]=Number(saved[field]);
    }
    return result;
  }
  function ladder(value,threshold,base,step,stepPay){
    const amount=number(value);
    return threshold!=null&&amount>=threshold&&step>0?base+Math.floor((amount-threshold)/step)*stepPay:0;
  }
  function siteTurnover(key,type,sales,month){
    const site=active(month||state.admin.bonusMonth||currentMonth()).sites[key];
    if(!site) return 0;
    return type==='tony'?ladder(sales,site.tonyStart,site.tonyBase,site.tonyStepSales,site.tonyStepPay):
      ladder(sales,site.staffStart,site.staffBase,site.staffStepSales,site.staffStepPay);
  }
  function siteDavanti(key,units,month){
    const site=active(month||state.admin.bonusMonth||currentMonth()).sites[key];
    return site&&site.davantiTarget!=null&&number(units)>=site.davantiTarget?
      site.davantiBase+(number(units)-site.davantiTarget)*site.davantiExtra:0;
  }
  function managerExtra(emp,siteKey,sales,month){
    const id=String(emp&&emp.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const manager=active(month||state.admin.bonusMonth||currentMonth()).managers[id];
    if(!manager||manager.site!==siteKey) return null;
    return manager.tiers.reduce((pay,tier)=>number(sales)>=tier[0]?tier[1]:pay,0);
  }
  function groupBonus(key,value,month){
    const rule=active(month||state.admin.bonusMonth||currentMonth()).group[key];
    return rule?ladder(value,rule.threshold,rule.base,rule.step,rule.stepPay):0;
  }
  function syncCore(month){
    const sites=active(month).sites;
    for(const key of siteKeys){
      if(!BONUS_SITE_RULES[key]) continue;
      for(const field of ['staffStart','staffBase','davantiTarget','tonyStart','tonyBase'])
        BONUS_SITE_RULES[key][field]=sites[key][field];
    }
  }
  const oldManagerExtra=bonusManagerExtra;
  bonusManagerExtra=function(emp,siteKey,sales){
    const configured=managerExtra(emp,siteKey,sales);
    return configured===null?oldManagerExtra.apply(this,arguments):configured;
  };
  bonusTonyDavanti=function(units){return groupBonus('tonyDavanti',units);};
  bonusNeilTurnover=function(sales){return groupBonus('neilTurnover',sales);};
  bonusNeilDavanti=function(units){return groupBonus('neilDavanti',units);};
  const oldRenderBonus=renderAdminBonus;
  renderAdminBonus=function(){
    syncCore(state.admin.bonusMonth||currentMonth());
    if(window.__bonusTonyView==='levels'&&isTonyLogin()){
      return '<div class="no-print" style="display:flex;gap:7px;margin-bottom:16px;">'+
        '<button type="button" data-bonus-view="sheet" class="add-btn secondary">Bonus Sheet</button>'+
        '<button type="button" data-bonus-view="levels" class="add-btn">Bonus Levels</button></div>'+renderEditor();
    }
    return oldRenderBonus.apply(this,arguments);
  };

  function numericInput(value,attrs){
    return '<input type="number" min="0" step="'+(attrs.step||'1')+'" value="'+escapeHtml(value==null?'':value)+'" '+attrs.data+' style="width:100%;max-width:160px;margin-top:4px;padding:7px;">';
  }
  function siteInput(key,label,field,value,step){
    return '<label style="font-size:11px;color:var(--muted);display:block;">'+escapeHtml(label)+numericInput(value,{step:step||'1',data:'data-bl-site="'+key+'" data-bl-field="'+field+'"'})+'</label>';
  }
  function sitePanel(key,s){
    return '<div class="card" style="margin:0;padding:14px;">'+
      '<h3 style="margin:0 0 10px;">'+escapeHtml(s.label)+'</h3>'+ 
      (key==='lido'?'<div style="font-size:11px;color:var(--muted);margin-bottom:9px;">Set Lido levels independently of Seaham. Lido remains excluded from Neil’s group turnover calculation.</div>':'')+
      '<div style="font-weight:700;font-size:12px;margin-bottom:5px;">Staff turnover</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;">'+
      siteInput(key,'Starts at (£)','staffStart',s.staffStart)+siteInput(key,'First bonus (£)','staffBase',s.staffBase)+siteInput(key,'Every extra sales (£)','staffStepSales',s.staffStepSales)+siteInput(key,'Bonus increases (£)','staffStepPay',s.staffStepPay)+'</div>'+
      '<div style="font-weight:700;font-size:12px;margin:12px 0 5px;">Davanti</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;">'+
      siteInput(key,'Unit target','davantiTarget',s.davantiTarget)+siteInput(key,'At target (£)','davantiBase',s.davantiBase)+siteInput(key,'Per extra unit (£)','davantiExtra',s.davantiExtra,'0.01')+'</div>'+
      (key==='gateshead'?'<div style="font-size:11px;color:var(--muted);margin-top:12px;">Gateshead stays excluded from Tony’s personal site-sales bonus.</div>':
      '<div style="font-weight:700;font-size:12px;margin:12px 0 5px;">Tony site-sales bonus</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;">'+
      siteInput(key,'Starts at (£)','tonyStart',s.tonyStart)+siteInput(key,'First bonus (£)','tonyBase',s.tonyBase)+siteInput(key,'Every extra sales (£)','tonyStepSales',s.tonyStepSales)+siteInput(key,'Bonus increases (£)','tonyStepPay',s.tonyStepPay)+'</div>')+
      '</div>';
  }
  function managerTierRow(key,index,threshold,payout){
    return '<tr data-bl-manager-row="'+key+'"><td>'+numericInput(threshold,{data:'data-bl-manager-threshold="'+key+'"',step:'1'})+'</td>'+
      '<td>'+numericInput(payout,{data:'data-bl-manager-pay="'+key+'"',step:'0.01'})+'</td>'+
      '<td><button class="add-btn secondary" type="button" data-action="bl-remove-tier" style="padding:6px 10px;">Remove</button></td></tr>';
  }
  function managerPanel(key,manager){
    return '<div class="card" style="margin:0;padding:14px;"><b>'+escapeHtml(manager.label)+'</b>'+
      '<div style="font-size:11px;color:var(--muted);margin:5px 0;">Extra payment on top of the normal staff bonus, at or above the site turnover threshold.</div>'+
      '<table style="width:100%;font-size:12px;"><thead><tr><th>Sales threshold (£)</th><th>Extra payout (£)</th><th></th></tr></thead><tbody data-bl-manager-table="'+key+'">'+
      manager.tiers.map((tier,i)=>managerTierRow(key,i,tier[0],tier[1])).join('')+
      '</tbody></table><button type="button" class="add-btn secondary" style="margin-top:8px;" data-action="bl-add-tier" data-manager="'+key+'">Add level</button></div>';
  }
  function groupPanel(key,group){
    return '<div class="card" style="margin:0;padding:14px;"><b>'+escapeHtml(group.label)+'</b>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:9px;margin-top:10px;">'+
      [['threshold','Starting threshold'],['base','First payout (£)'],['step','Every extra (units / £)'],['stepPay','Payout increase (£)']].map(([field,label])=>
        '<label style="font-size:11px;color:var(--muted);">'+escapeHtml(label)+numericInput(group[field],{data:'data-bl-group="'+key+'" data-bl-group-field="'+field+'"',step:field==='base'||field==='stepPay'?'0.01':'1'})+'</label>').join('')+'</div></div>';
  }
  function renderEditor(){
    if(typeof isTonyLogin!=='function'||!isTonyLogin()) return '<h2>Bonus Levels</h2><div class="card">Only Tony can edit bonus levels.</div>';
    const scheme=active(editorMonth), activeFrom=activeMonthKey(editorMonth);
    return '<h2>Bonus Levels</h2>'+
      '<div class="head-sub">Set the bonuses that feed the Bonus Sheet and predictions. Changes take effect from the chosen month; earlier months keep their original levels.</div>'+
      '<div class="card no-print" style="display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'+
      '<label style="font-size:12px;">Effective from <input id="bonus-level-effective" type="month" value="'+escapeHtml(editorMonth)+'" style="margin-top:5px;"></label>'+
      '<button class="add-btn" type="button" data-action="bl-save">Save bonus levels</button>'+
      '<button class="add-btn secondary" type="button" data-action="bl-discard">Discard unsaved edits</button>'+
      '<span style="font-size:11px;color:var(--muted);">'+(activeFrom?'Based on levels effective '+escapeHtml(activeFrom):'Showing original bonus levels')+'. Save before changing the effective month.</span></div>'+
      '<h3>Site bonuses</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:12px;">'+
      siteKeys.map(key=>sitePanel(key,scheme.sites[key])).join('')+'</div>'+
      '<h3 style="margin-top:24px;">Manager extra levels</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:12px;">'+
      Object.keys(scheme.managers).map(key=>managerPanel(key,scheme.managers[key])).join('')+'</div>'+
      '<h3 style="margin-top:24px;">Tony and Neil group levels</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:12px;">'+
      Object.keys(scheme.group).map(key=>groupPanel(key,scheme.group[key])).join('')+'</div>'+
      '<div class="card" style="margin-top:14px;font-size:12px;color:var(--muted);">The existing sickness, manual employee overrides, tracking/add-ons, reception splits, Lee Dunn transition and group exclusions are not changed by this editor.</div>';
  }
  function requireNumber(input,label,nullable){
    if(!input) throw new Error('Missing field: '+label+'.');
    const raw=String(input.value||'').trim();
    if(raw===''&&nullable) return null;
    if(raw===''||!Number.isFinite(Number(raw))||Number(raw)<0) throw new Error('Enter a valid zero or positive number for '+label+'.');
    return Number(raw);
  }
  function readEditor(){
    const scheme=active(editorMonth);
    for(const key of siteKeys){
      for(const field of siteFields){
        if(key==='gateshead'&&field.startsWith('tony')) continue;
        const input=document.querySelector('[data-bl-site="'+key+'"][data-bl-field="'+field+'"]');
        scheme.sites[key][field]=requireNumber(input,scheme.sites[key].label+' '+field,field==='staffStart'||field==='tonyStart');
      }
      for(const field of ['staffStepSales','tonyStepSales']){
        if(key==='gateshead'&&field==='tonyStepSales') continue;
        if(scheme.sites[key][field]<=0) throw new Error(scheme.sites[key].label+' step must be greater than zero.');
      }
    }
    for(const key of Object.keys(managerDefaults)){
      const rows=[...document.querySelectorAll('[data-bl-manager-row="'+key+'"]')];
      const tiers=rows.map(row=>[
        requireNumber(row.querySelector('[data-bl-manager-threshold]'),managerDefaults[key].label+' threshold'),
        requireNumber(row.querySelector('[data-bl-manager-pay]'),managerDefaults[key].label+' payout')
      ]);
      const thresholds=tiers.map(t=>t[0]);
      if(new Set(thresholds).size!==thresholds.length) throw new Error('Duplicate turnover thresholds for '+managerDefaults[key].label+'.');
      scheme.managers[key]=tiers.sort((a,b)=>a[0]-b[0]);
    }
    for(const key of Object.keys(groupDefaults)){
      for(const field of ['threshold','base','step','stepPay']){
        const input=document.querySelector('[data-bl-group="'+key+'"][data-bl-group-field="'+field+'"]');
        scheme.group[key][field]=requireNumber(input,groupDefaults[key].label+' '+field);
      }
      if(scheme.group[key].step<=0) throw new Error(groupDefaults[key].label+' step must be greater than zero.');
    }
    return {sites:scheme.sites,managers:scheme.managers,group:scheme.group,updatedAt:Date.now(),updatedBy:String(_session&&_session.email||'')};
  }
  async function saveEditor(){
    if(!isTonyLogin()) return;
    let values;
    try{values=readEditor();}catch(error){showToast(error.message,true);return;}
    const previous=state.config.bonusLevelVersions;
    state.config.bonusLevelVersions={...allVersions(),[editorMonth]:values};
    try{
      if(!await saveConfig()){
        state.config.bonusLevelVersions=previous;
        showToast('Bonus levels could not be saved.',true);return;
      }
      syncCore(editorMonth);
      showToast('Bonus levels saved from '+editorMonth+'.');
      render();
    }catch(error){
      state.config.bonusLevelVersions=previous;
      showToast('Bonus levels could not be saved.',true);
    }
  }
  document.addEventListener('change',function(event){
    if(event.target&&event.target.id==='bonus-level-effective'&&isTonyLogin()){
      const value=String(event.target.value||'');
      if(!monthPattern.test(value)){showToast('Choose a valid month.',true);return;}
      editorMonth=value;
      render();
    }
  },true);
  document.addEventListener('click',function(event){
    const button=event.target&&event.target.closest&&event.target.closest('[data-action]');
    if(!button||!String(button.dataset.action||'').startsWith('bl-')) return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!isTonyLogin()) return;
    const action=button.dataset.action;
    if(action==='bl-save'){void saveEditor();return;}
    if(action==='bl-discard'){render();return;}
    if(action==='bl-remove-tier'){const row=button.closest('[data-bl-manager-row]');if(row)row.remove();return;}
    if(action==='bl-add-tier'){
      const key=button.dataset.manager;
      const table=document.querySelector('[data-bl-manager-table="'+key+'"]');
      if(table&&managerDefaults[key]) table.insertAdjacentHTML('beforeend',managerTierRow(key,table.children.length,0,0));
    }
  },true);
  window.ShiftboardBonusLevels={render:renderEditor,active,siteTurnover,siteDavanti,managerExtra,groupBonus,syncCore};
})();
