'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../public/kiosk-holiday-calendar.js','utf8');
const sql=fs.readFileSync(__dirname+'/../database/049_kiosk_site_authorised_holidays.sql','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function kiosk(options={}){
 const device={site:options.site||'s1'};
 const requests=[],state={view:'home',admin:{authed:false}};
 const ctx={
  window:{},state,
  SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'public-test-key',
  getKioskSite:()=>device.site,
  siteName:id=>id==='s1'?'Seaham':'Peterlee',
  topstrip:()=>'<header>Shiftboard</header>',
  render:()=>{},
  document:{createElement:()=>({textContent:''}),head:{appendChild:()=>{}},addEventListener:()=>{}},
  setInterval:()=>{},
  fetch:async(url,init)=>{
   const fn=url.split('/').pop(),args=JSON.parse(init.body);
   requests.push({fn,args,auth:init.headers.Authorization});
   if(options.reject)throw new Error('offline');
   const data=options.response?options.response(fn,args):{
    ok:true,siteId:args.p_site_id,month:args.p_month,
    entries:[],updatedAt:'2026-10-21T10:00:00Z'
   };
   return {ok:true,json:async()=>data};
  }
 };
 vm.runInNewContext(source,ctx,{filename:'kiosk-holiday-calendar.js'});
 return {api:ctx.window.shiftboardHolidayCalendar,requests,state,device};
}

test('kiosk calendar opens without manager sign-in, PIN or grant',async()=>{
 const k=kiosk();k.api.open();await flush();
 assert.equal(k.state.view,'kiosk-holidays');
 assert.equal(k.requests.length,1);
 assert.equal(k.requests[0].fn,'kiosk_holidays_month');
 assert.equal(k.requests[0].args.p_site_id,'s1');
 assert.equal(k.requests[0].args.p_token,undefined);
 assert.equal(k.requests[0].auth,'Bearer public-test-key');
 assert.doesNotMatch(k.api.view(),/Manager setup required|Manager sign in/);
});

test('monthly navigation fetches new dates from the selected site',async()=>{
 const k=kiosk();
 k.api.open();await flush();
 const first=k.requests[0].args.p_month;
 k.api.change(1);await flush();
 assert.notEqual(k.requests[1].args.p_month,first);
 assert.equal(k.requests[1].args.p_site_id,'s1');
 assert.match(k.api.view(),/Authorised Holidays/);
});

test('site change removes previous site names during refresh',async()=>{
 const k=kiosk({response:(fn,args)=>({
  ok:true,siteId:args.p_site_id,month:args.p_month,
  updatedAt:'2026-10-21T10:00:00Z',
  entries:[{date:args.p_month+'-23',name:args.p_site_id==='s1'?'Seaham Person':'Peterlee Person',unit:'days',amount:1}]
 })});
 k.api.open();await flush();
 assert.match(k.api.view(),/Seaham Person/);
 k.device.site='s2';k.api.open();
 assert.doesNotMatch(k.api.view(),/Seaham Person/);
 await flush();
 assert.match(k.api.view(),/Peterlee Person/);
 assert.doesNotMatch(k.api.view(),/Seaham Person/);
});

test('connection errors show retry instead of stale approvals',async()=>{
 const k=kiosk({reject:true});k.api.open();await flush();
 assert.match(k.api.view(),/Calendar unavailable/);
 assert.match(k.api.view(),/Try again/);
 assert.doesNotMatch(k.api.view(),/Updated/);
});

test('server SQL filters approved only, selects site staff, and projects safe fields',()=>{
 assert.match(sql,/create or replace function public\.kiosk_holidays_month\(p_site_id text, p_month text\)/);
 assert.match(sql,/r->>'status'='approved'/);
 assert.match(sql,/e->>'siteId'=p_site_id/);
 assert.match(sql,/jsonb_build_object\(\s*'date',date_iso,'name',display_name,'amount',amount,'unit',unit/s);
 assert.match(sql,/grant execute on function public\.kiosk_holidays_month\(text,text\) to anon, authenticated/);
 assert.doesNotMatch(sql,/grant execute on function public\.kiosk_holidays_enrol/);
});
