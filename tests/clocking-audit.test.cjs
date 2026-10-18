'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../clocking-audit-core.js');
const d=s=>Date.parse(s);
const nowMs=d('2026-10-18T17:00:00Z');
const employees=[{id:'e1',name:'Worker & One',siteId:'s1'},{id:'e2',name:'Worker Two',siteId:'s2'}];
const sites=[{id:'s1',name:'Seaham'},{id:'s2',name:'Gateshead'}];
const event=(id,date,rest={})=>({id,employeeId:'e1',siteId:'s1',type:'in',timestamp:d(date),...rest});
const run=events=>core.summarize({events,employees,sites},{nowMs});

test('flags 3+ manager-entered clocks across two distinct days',()=>{
 const summary=run([
  event('a','2026-10-17T08:00:00Z',{enteredBy:'Manager'}),
  event('b','2026-10-17T16:00:00Z',{enteredBy:'Manager'}),
  event('c','2026-10-18T08:00:00Z',{enteredBy:'Manager',siteId:'s2'})
 ]);
 assert.equal(summary.counts.managerEntered,3);
 assert.equal(summary.counts.staffFlagged,1);
 assert.equal(summary.flagged[0].distinctDays,2);
 assert.deepEqual(summary.flagged[0].centres,['Gateshead','Seaham']);
});

test('does not flag repeated manual clocks confined to one day',()=>{
 const s=run([
  event('a','2026-10-18T08:00:00Z',{enteredBy:'Manager'}),
  event('b','2026-10-18T10:00:00Z',{enteredBy:'Manager'}),
  event('c','2026-10-18T12:00:00Z',{enteredBy:'Manager'})
 ]);
 assert.equal(s.counts.managerEntered,3);
 assert.equal(s.counts.staffFlagged,0);
});

test('PIN-pathway clocks and manager time edits remain distinct',()=>{
 const s=run([
  event('a','2026-10-17T08:00:00Z',{editedBy:'Manager A'}),
  event('b','2026-10-18T08:00:00Z',{enteredBy:'Manager B',editedBy:'Manager C'})
 ]);
 assert.equal(s.counts.events,2);
 assert.equal(s.counts.pinPath,1);
 assert.equal(s.counts.managerEntered,1);
 assert.equal(s.counts.managerEdited,2);
 assert.equal(s.counts.staffFlagged,0);
});

test('excludes events outside seven days, future clocks and unknown staff',()=>{
 const s=run([
  event('old','2026-10-01T12:00:00Z',{enteredBy:'Manager'}),
  event('future','2026-10-19T07:00:00Z',{enteredBy:'Manager'}),
  event('unknown','2026-10-18T08:00:00Z',{employeeId:'not-found',enteredBy:'Manager'}),
  event('current','2026-10-18T09:00:00Z')
 ]);
 assert.equal(s.counts.events,1);
});

test('uses UK local dates including BST midnight boundary',()=>{
 const s=run([
  event('a','2026-10-17T22:30:00Z',{enteredBy:'Manager'}),
  event('b','2026-10-17T23:30:00Z',{enteredBy:'Manager'}),
  event('c','2026-10-18T08:30:00Z',{enteredBy:'Manager'})
 ]);
 assert.equal(s.flagged[0].distinctDays,2);
});

test('counts timesheet day overrides without sharing PINs',()=>{
 const s=core.summarize({employees,sites,events:[
  event('a','2026-10-18T08:00:00Z',{enteredBy:'Manager',pin:'1234'})
 ],timesheetExtras:{'2026-10-12':{employees:{e1:{hoursOverride:{'2026-10-15':'7.5','2026-10-16':'','2026-09-01':'8'}}}}}},{nowMs});
 assert.equal(s.counts.hourOverrides,1);
 const html=core.emailSection(s);
 assert.ok(!html.includes('1234'));
 assert.match(html,/PIN clocking does not prove/);
});

test('escapes employee names in future email HTML',()=>{
 const s=run([
  event('a','2026-10-17T08:00:00Z',{enteredBy:'Manager'}),
  event('b','2026-10-17T12:00:00Z',{enteredBy:'Manager'}),
  event('c','2026-10-18T08:00:00Z',{enteredBy:'Manager'})
 ]);
 const html=core.emailSection(s);
 assert.ok(html.includes('Worker &amp; One'));
 assert.ok(!html.includes('Worker & One'));
});

test('clock log panel and email fragment are visible only to super role',()=>{
 const script=fs.readFileSync(__dirname+'/../clocking-audit-panel.js','utf8');
 for(const role of ['site','super']){
  const context={console,Date,Intl,renderAdminClockLog:()=>'<h2>Clock Log</h2><details open>Old log</details>',
   state:{admin:{role},config:{employees,sites},events:[],timesheetExtras:{}},ShiftboardClockingAuditCore:core};
  context.globalThis=context;
  vm.runInNewContext(script,context);
  assert.equal(context.renderAdminClockLog().includes('Manager-entered clocking review'),role==='super');
  assert.equal(context.shiftboardManagementClockingEmailSection().includes('Clocking &amp; PIN Audit'),role==='super');
 }
});