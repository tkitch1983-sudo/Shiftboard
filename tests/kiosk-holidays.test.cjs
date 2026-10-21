'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../public/kiosk-holiday-calendar.js','utf8');
const sql=fs.readFileSync(__dirname+'/../database/050_kiosk_holidays_direct_open.sql','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function kiosk(options={}){
 let site=options.site||'s1';
 const requests=[],state={view:'home'};
 const ctx={
  window:{},state,Date,console,
  SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'public-test-key',
  getKioskSite:()=>site,
  siteName:id=>id==='s1'?'Seaham':'Peterlee',
  topstrip:()=>'<header>Shiftboard</header>',
  render:()=>{},
  document:{createElement:()=>({textContent:''}),head:{appendChild:()=>{}},addEventListener:()=>{}},
  setInterval:()=>{},
  fetch:async(url,init)=>{
   const fn=url.split('/').pop(),args=JSON.parse(init.body);
   requests.push({fn,args,auth:init.headers.Authorization});
   if(options.failed) return {ok:false,json:async()=>({message:'Server unavailable'})};
   const data=options.response?options.response(fn,args):{ok:true,siteId:site,month:args.p_month,entries:[],updatedAt:'2026-10-21T11:00:00Z'};
   return {ok:true,json:async()=>data};
  }
 };
 vm.runInNewContext(source,ctx,{filename:'kiosk-holiday-calendar.js'});
 return {api:ctx.window.shiftboardHolidayCalendar,state,requests,
  setSite:v=>{site=v;},
  setFail:v=>{options.failed=v;}};
}
test('kiosk calendar opens immediately with no manager login, PIN or grant',async()=>{
 const k=kiosk();
 k.api.open();await flush();
 assert.equal(k.state.view,'kiosk-holidays');
 assert.equal(k.requests.length,1);
 assert.equal(k.requests[0].fn,'kiosk_holidays_month');
 assert.equal(k.requests[0].args.p_site_id,'s1');
 assert.ok(!Object.hasOwn(k.requests[0].args,'p_token'));
 assert.equal(k.requests[0].auth,'Bearer public-test-key');
 assert.doesNotMatch(k.api.view(),/Manager setup required|Manager sign in/);
});
test('site-filtered approved dates render and escape staff names',async()=>{
 const k=kiosk({site:'s2',response:(_fn,args)=>({ok:true,siteId:'s2',month:args.p_month,
  updatedAt:'2026-10-21T11:00:00Z',entries:[{date:args.p_month+'-23',name:'A <script>',amount:0.5,unit:'days'}]})});
 k.api.open();await flush();
 assert.equal(k.requests[0].args.p_site_id,'s2');
 assert.match(k.api.view(),/Peterlee/);
 assert.match(k.api.view(),/A &lt;script&gt;/);
 assert.doesNotMatch(k.api.view(),/A <script>/);
 const date=k.requests[0].args.p_month+'-23';
 k.api.choose(date);
 assert.match(k.api.view(),/½ day/);
});
test('month change requests the new month',async()=>{
 const k=kiosk();
 k.api.open();await flush();
 k.api.change(1);await flush();
 assert.equal(k.requests.length,2);
 assert.notEqual(k.requests[0].args.p_month,k.requests[1].args.p_month);
});
test('site changes do not retain stale previous-site names',async()=>{
 const k=kiosk({response:(_fn,args)=>({ok:true,siteId:args.p_site_id,month:args.p_month,
  entries:[{date:args.p_month+'-12',name:args.p_site_id==='s1'?'Seaham Person':'Peterlee Person',amount:1,unit:'days'}]})});
 k.api.open();await flush();
 assert.match(k.api.view(),/Seaham Person/);
 k.setSite('s2');await k.api.load();
 assert.equal(k.requests.at(-1).args.p_site_id,'s2');
 assert.match(k.api.view(),/Peterlee Person/);
 assert.doesNotMatch(k.api.view(),/Seaham Person/);
});
test('network failure shows retry instead of stale holiday entries',async()=>{
 const k=kiosk({response:(_fn,args)=>({ok:true,siteId:args.p_site_id,month:args.p_month,
  entries:[{date:args.p_month+'-12',name:'Old Person',amount:1,unit:'days'}]})});
 k.api.open();await flush();
 assert.match(k.api.view(),/Old Person/);
 k.setFail(true);await k.api.load();
 assert.match(k.api.view(),/Calendar unavailable/);
 assert.match(k.api.view(),/Try again/);
 assert.doesNotMatch(k.api.view(),/Old Person/);
});
test('SQL projects only approved site holidays, excluding private employee details',()=>{
 assert.match(sql,/create or replace function public\.kiosk_holidays_month\(p_site_id text, p_month text\)/);
 assert.match(sql,/r->>'status'='approved'/);
 assert.match(sql,/e->>'siteId'=p_site_id/);
 assert.match(sql,/coalesce\(\(e->>'active'\)::boolean,true\)/);
 assert.match(sql,/grant execute on function public\.kiosk_holidays_month\(text,text\) to anon, authenticated/);
 assert.doesNotMatch(sql,/kiosk_holidays_enrol\(p_site_id|holiday_balance|pay_rate/);
 assert.doesNotMatch(source,/beginLogin|afterLogin|p_token|verifiedPin|localStorage/);
});
test('root and public deployed copies remain aligned with no-login flow',()=>{
 assert.equal(source,fs.readFileSync(__dirname+'/../kiosk-holiday-calendar.js','utf8'));
 for(const path of ['index.html','public/index.html']){
  const html=fs.readFileSync(__dirname+'/../'+path,'utf8');
  assert.match(html,/data-action="open-kiosk-holidays"/);
  assert.match(html,/state\.view==='kiosk-holidays'/);
  assert.match(html,/kiosk-holiday-calendar\.js\?v=2/);
  assert.match(html,/kiosk-holiday-retry/);
  assert.doesNotMatch(html,/kiosk-holiday-login|kiosk-holiday-enrol|afterLogin\(\)/);
 }
});
