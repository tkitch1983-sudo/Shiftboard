(function editableBonusTests(){
  'use strict';
  const test=require('node:test');
  const assert=require('node:assert/strict');
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const root=path.join(__dirname,'..');
  const script=fs.readFileSync(path.join(root,'bonus-levels-editor.js'),'utf8');
  const defaults={
    peterlee:[90000,350,150,85000,250],middlesbrough:[90000,350,150,85000,250],
    fairfield:[80000,450,100,75000,250],chester:[70000,350,50,75000,250],
    gateshead:[70000,350,75,null,0],seaham:[70000,350,100,60000,50],
    hartlepool:[45000,400,50,45000,50],lido:[null,0,100,null,0]
  };
  function setup(tony=true){
    const rules=Object.fromEntries(Object.entries(defaults).map(([key,x])=>[key,{
      label:key,staffStart:x[0],staffBase:x[1],davantiTarget:x[2],tonyStart:x[3],tonyBase:x[4],groupActive:key!=='lido'
    }]));
    const handlers={};
    const ctx={
      window:{},state:{config:{},admin:{bonusMonth:'2026-11'}},
      BONUS_SITE_RULES:rules,bonusManagerExtra:()=>0,
      bonusTonyDavanti:()=>0,bonusNeilTurnover:()=>0,bonusNeilDavanti:()=>0,
      renderAdminBonus:()=>'<div>LEGACY BONUS SHEET</div>',
      document:{addEventListener(type,handler){(handlers[type]||(handlers[type]=[])).push(handler);}},
      isTonyLogin:()=>tony,showToast(){},saveConfig:async()=>true,render(){},
      _session:{email:'tony@neautoservices.com'}
    };
    vm.runInNewContext(script,ctx,{filename:'bonus-levels-editor.js'});
    ctx.handlers=handlers;
    return ctx;
  }
  test('all original bonus figures remain unchanged until a version is saved',()=>{
    const ctx=setup(),editor=ctx.window.ShiftboardBonusLevels;
    assert.equal(editor.siteTurnover('peterlee','staff',90000,'2026-11'),350);
    assert.equal(editor.siteTurnover('peterlee','staff',95000,'2026-11'),400);
    assert.equal(editor.siteDavanti('fairfield',102,'2026-11'),54);
    assert.equal(editor.siteTurnover('gateshead','tony',250000,'2026-11'),0);
    assert.equal(editor.siteTurnover('lido','staff',75000,'2026-11'),400);
    assert.equal(ctx.bonusManagerExtra({name:'T Hope'},'middlesbrough',160000),600);
    assert.equal(ctx.bonusTonyDavanti(650),150);
    assert.equal(ctx.bonusNeilTurnover(550000),750);
    assert.equal(ctx.bonusNeilDavanti(600),150);
  });
  test('saving a scheme effective December leaves November unchanged',()=>{
    const ctx=setup(),editor=ctx.window.ShiftboardBonusLevels;
    ctx.state.config.bonusLevelVersions={'2026-12':{
      sites:{seaham:{staffStart:80000,staffBase:600,staffStepSales:10000,staffStepPay:80,davantiTarget:120,davantiBase:100,davantiExtra:3}},
      managers:{thope:[[100000,100],[160000,900]]},
      group:{neilTurnover:{threshold:550000,base:900,step:25000,stepPay:50}}
    }};
    assert.equal(editor.siteTurnover('seaham','staff',80000,'2026-11'),450);
    assert.equal(editor.siteTurnover('seaham','staff',80000,'2026-12'),600);
    assert.equal(editor.siteTurnover('seaham','staff',90000,'2027-02'),680);
    assert.equal(editor.siteTurnover('lido','staff',80000,'2027-02'),600);
    assert.equal(editor.siteDavanti('seaham',125,'2026-12'),115);
    assert.equal(editor.siteDavanti('seaham',125,'2026-11'),100);
    ctx.state.admin.bonusMonth='2026-12';
    assert.equal(ctx.bonusManagerExtra({name:'T Hope'},'middlesbrough',160000),900);
    assert.equal(ctx.bonusNeilTurnover(600000),1000);
  });
  test('Lido can have its own saved levels without changing Seaham or prior months',()=>{
    const ctx=setup(),editor=ctx.window.ShiftboardBonusLevels;
    ctx.state.config.bonusLevelVersions={'2027-01':{sites:{
      lido:{staffStart:50000,staffBase:450,staffStepSales:10000,staffStepPay:75,
        davantiTarget:70,davantiBase:65,davantiExtra:4,
        tonyStart:50000,tonyBase:100,tonyStepSales:5000,tonyStepPay:15}
    }}};
    assert.equal(editor.siteTurnover('lido','staff',60000,'2026-12'),250);
    assert.equal(editor.siteTurnover('lido','staff',60000,'2027-01'),525);
    assert.equal(editor.siteTurnover('seaham','staff',70000,'2027-01'),350);
    assert.equal(editor.siteDavanti('lido',72,'2027-01'),73);
    assert.equal(editor.siteDavanti('seaham',102,'2027-01'),54);
    assert.equal(editor.siteTurnover('lido','tony',60000,'2027-01'),130);
    editor.syncCore('2027-01');
    assert.equal(ctx.BONUS_SITE_RULES.lido.groupActive,false);
    assert.equal(ctx.BONUS_SITE_RULES.seaham.staffStart,70000);
  });
  test('Lido inputs appear on the editor and are included when saving',async()=>{
    const ctx=setup(),editor=ctx.window.ShiftboardBonusLevels,scheme=editor.active('2026-11');
    const page=editor.render();
    assert.match(page,/data-bl-site="lido" data-bl-field="staffStart"/);
    assert.match(page,/data-bl-site="lido" data-bl-field="davantiTarget"/);
    assert.match(page,/data-bl-site="lido" data-bl-field="tonyStart"/);
    assert.match(page,/Set Lido levels independently of Seaham/);
    ctx.document.querySelector=selector=>{
      const site=/^\[data-bl-site="([^"]+)"\]\[data-bl-field="([^"]+)"\]$/.exec(selector);
      if(site){
        const value=site[1]==='lido'&&site[2]==='staffStart'?55000:scheme.sites[site[1]][site[2]];
        return {value:value==null?'':String(value)};
      }
      const group=/^\[data-bl-group="([^"]+)"\]\[data-bl-group-field="([^"]+)"\]$/.exec(selector);
      if(group)return {value:String(scheme.group[group[1]][group[2]])};
      return null;
    };
    ctx.document.querySelectorAll=selector=>{
      const manager=/^\[data-bl-manager-row="([^"]+)"\]$/.exec(selector);
      if(!manager)return [];
      return scheme.managers[manager[1]].tiers.map(tier=>({
        querySelector:field=>({value:String(field.includes('threshold')?tier[0]:tier[1])})
      }));
    };
    const click=ctx.handlers.click[0];
    click({target:{closest:()=>({dataset:{action:'bl-save'}})},preventDefault(){},stopImmediatePropagation(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ctx.state.config.bonusLevelVersions['2026-11'].sites.lido.staffStart,55000);
    assert.equal(ctx.state.config.bonusLevelVersions['2026-11'].sites.seaham.staffStart,70000);
    assert.equal(editor.siteTurnover('lido','staff',55000,'2026-11'),350);
    assert.equal(editor.siteTurnover('seaham','staff',55000,'2026-11'),0);
  });
  test('the legacy Bonus Levels toggle and the new admin tab show the editable page to Tony only',()=>{
    const ctx=setup(),editor=ctx.window.ShiftboardBonusLevels;
    assert.match(editor.render(),/Save bonus levels/);
    assert.match(editor.render(),/Manager extra levels/);
    ctx.window.__bonusTonyView='levels';
    assert.match(ctx.renderAdminBonus(),/Save bonus levels/);
    const other=setup(false);
    other.window.__bonusTonyView='levels';
    assert.doesNotMatch(other.window.ShiftboardBonusLevels.render(),/Save bonus levels/);
    assert.match(other.renderAdminBonus(),/LEGACY BONUS SHEET/);
  });
  test('both deploy variants, injection and UI routes stay in sync',()=>{
    const mirror=fs.readFileSync(path.join(root,'public','bonus-levels-editor.js'),'utf8');
    assert.equal(script,mirror);
    for(const file of ['index.html','public/index.html']){
      const html=fs.readFileSync(path.join(root,file),'utf8');
      assert.match(html,/\['bonuslevels','Bonus Levels','Sales'\]/);
      assert.match(html,/if\(tab==='bonuslevels'\) return isTonyLogin\(\)/);
      assert.match(html,/<script src="\.\/bonus-levels-editor\.js\?v=4" defer><\/script>/);
      assert.match(html,/ShiftboardBonusLevels\.siteTurnover/);
    }
    for(const file of ['sw.js','public/sw.js']){
      const sw=fs.readFileSync(path.join(root,file),'utf8');
      assert.match(sw,/\['bonus-levels-editor\.js','4'\]/);
    }
  });
})();
