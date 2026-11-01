'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'bonus-prediction-lido.js'), 'utf8');

function setup() {
  const originalCalc = (emp, siteCalc, month, draft, receptionCount) => ({
    employee: emp.name,
    siteKey: siteCalc.siteKey,
    base: siteCalc.staffBonus,
    davanti: siteCalc.davantiBonus,
    addOn: siteCalc.addOnBonus,
    receptionCount
  });
  const rules = {
    fairfield: { label:'Fairfield', staffStart:80000, staffBase:450, davantiTarget:100 },
    middlesbrough: { label:'Middlesbrough', staffStart:90000, staffBase:350, davantiTarget:150 },
    seaham: { label:'Seaham', staffStart:70000, staffBase:350, davantiTarget:100, tonyStart:60000, tonyBase:50 },
    lido: { label:'Lido', staffStart:null, staffBase:0, davantiTarget:100 }
  };
  const snapshots = {
    fairfield: { total_current:100896.38, davanti:100 },
    lido: { total_current:80000, davanti:119 },
    middlesbrough: { total_current:111995.69, davanti:139 }
  };
  const context = {
    BONUS_SITE_RULES: rules,
    bonusAmount: v => Number(v) || 0,
    bonusTier: (sales, start, base) => sales >= start ? base + Math.floor((sales - start) / 5000) * 50 : 0,
    bonusDavanti: (units, target) => units >= target ? 50 + (units - target) * 2 : 0,
    bonusAddOn: () => 216,
    bonusMonthData: () => ({sitePredictions:{}}),
    bonusSnapshotsForMonth: () => snapshots,
    bonusSiteKey: name => String(name || '').toLowerCase(),
    bonusRole: emp => emp.bonusRole || (emp.name.includes('Dunn') ? 'reception' : 'workshop'),
    bonusEmployeeCalc: originalCalc,
    document: { addEventListener() {}, querySelectorAll() { return []; } },
    window: {},
    state: {
      admin: {bonusMonth:'2026-10'},
      config: {
        sites: [{id:'f',name:'Fairfield'},{id:'m',name:'Middlesbrough'},{id:'l',name:'Lido'}],
        employees: [
          {id:1,name:'K Walsh',siteId:'f',active:true,bonusRole:'reception'},
          {id:2,name:'M McCormick',siteId:'f',active:true,bonusRole:'reception'},
          {id:3,name:'Lee Dunn',siteId:'l',active:true,bonusRole:'reception'}
        ]
      }
    }
  };
  vm.runInNewContext(script, context, {filename:'bonus-prediction-lido.js'});
  return context;
}

test('Lee Dunn takes only Fairfield base Sep–Dec 2026, while Davanti and add-on remain Lido', () => {
  const ctx = setup(), draft = {employees:{}};
  const lido = {siteKey:'lido',staffBonus:450,davantiBonus:88,addOnBonus:200};
  const middlesbrough = {siteKey:'middlesbrough',staffBonus:550,davantiBonus:0,addOnBonus:234};
  for (const name of ['Lee Dunn','L Dunn']) {
    const actual = ctx.bonusEmployeeCalc({name},lido,'2026-10',draft,1);
    assert.equal(actual.siteKey,'lido');
    assert.equal(actual.base,650);
    assert.equal(actual.davanti,88);
    assert.equal(actual.addOn,200);
    assert.equal(actual.receptionCount,1);
  }
  for (const name of ['Lee Hornsey','L Hornsey','L Hornsley']) {
    const actual = ctx.bonusEmployeeCalc({name},middlesbrough,'2026-10',draft,2);
    assert.equal(actual.siteKey,'middlesbrough');
    assert.equal(actual.base,550);
    assert.equal(actual.addOn,234);
  }
});

test('Lee Dunn uses Lido bonus from January 2027 onward', () => {
  const ctx = setup();
  const actual = ctx.bonusEmployeeCalc(
    {name:'Lee Dunn'}, {siteKey:'lido',staffBonus:450,davantiBonus:88,addOnBonus:200}, '2027-01', {employees:{}}, 1
  );
  assert.equal(actual.siteKey,'lido');
  assert.equal(actual.base,450);
  assert.equal(actual.davanti,88);
  assert.equal(actual.addOn,200);
  assert.equal(actual.receptionCount,1);
});

test('Lee Dunn is not backdated to Fairfield before September 2026', () => {
  const ctx = setup();
  const actual = ctx.bonusEmployeeCalc(
    {name:'L Dunn'}, {siteKey:'lido',staffBonus:450,davantiBonus:88,addOnBonus:200}, '2026-08', {employees:{}}, 1
  );
  assert.equal(actual.siteKey,'lido');
  assert.equal(actual.base,450);
});

test('Bonus Levels wording names Lee Dunn', () => {
  assert.match(script, /Lee Dunn receives the Fairfield base staff bonus/);
  assert.match(script, /his Davanti bonus and add-on share remain based on Lido/);
  assert.doesNotMatch(script, /Lee Hornsey follows Fairfield bonus calculations/);
});
