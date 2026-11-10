const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const file of ['index.html','public/index.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(match[1].trim()) new vm.Script(match[1],{filename:file});
 const src=html.slice(html.indexOf('function christmasHolidayRows('),html.indexOf('function renderAdminChristmasHolidays('));
 function row({bookings={},pending=false,hourly=false,hours={},working=true,active=true,petrol=false}={}){
  const ctx={state:{config:{employees:[{id:'e',siteId:'s',active}]},admin:{christmasHours:hours}},isFillingStationSite:()=>petrol,approvedDatesForEmployee:()=>new Map(Object.entries(bookings)),isHourly:()=>hourly,isWorkingHolidayDay:()=>working,fromIso:x=>x,pendingHolidayFor:()=>pending,holidayAllowanceMonthEndBalance:()=>1.5};
  vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.christmasHolidayRows('2026')[0];
 }
 test(file+': two unbooked days flag shortage',()=>{assert.equal(row().extra,2);assert.equal(row().after,-0.5);});
 test(file+': approved days are not deducted twice',()=>{assert.equal(row({bookings:{'2026-12-24':1,'2026-12-31':1}}).extra,0);});
 test(file+': half day only needs the remainder',()=>{assert.equal(row({bookings:{'2026-12-24':0.5}}).extra,1.5);});
 test(file+': pending remains unapproved',()=>{const r=row({pending:true});assert.equal(r.extra,2);assert.equal(r.dates[0].pending,true);});
 test(file+': hourly staff need explicit scheduled hours',()=>{assert.equal(row({hourly:true}).after,null);const r=row({hourly:true,hours:{'e:2026-12-24':'8','e:2026-12-31':'0'},bookings:{'2026-12-24':4}});assert.equal(r.extra,4);});
 test(file+': inactive and non-working staff handled',()=>{assert.equal(row({active:false}),undefined);assert.equal(row({working:false}).extra,0);});
 test(file+': filling station staff excluded',()=>{assert.equal(row({petrol:true}),undefined);assert.ok(row({petrol:false}));});
 test(file+': Christmas tab is restricted to Tony',()=>{
  const access=html.slice(html.indexOf('function canAccessAdminTab('),html.indexOf('function canViewPrivateTab('));
  for(const allowed of [true,false]){
   const ctx={state:{admin:{role:'super'}},isTonyLogin:()=>allowed};
   vm.createContext(ctx);vm.runInContext(access,ctx);
   assert.equal(ctx.canAccessAdminTab('christmasholidays'),allowed);
  }
  const render=html.slice(html.indexOf('function renderAdminChristmasHolidays('),html.indexOf("document.addEventListener('click',function(event){",html.indexOf('function renderAdminChristmasHolidays(')));
  const ctx={isTonyLogin:()=>false};vm.createContext(ctx);vm.runInContext(render,ctx);
  assert.match(ctx.renderAdminChristmasHolidays(),/Tony only/);
 });
}
