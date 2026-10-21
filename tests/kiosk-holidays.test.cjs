'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../public/kiosk-holiday-calendar.js','utf8');
const sql=fs.readFileSync(__dirname+'/../database/049_kiosk_site_authorised_holidays.sql','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function kiosk(options={}){
 const site=options.site||'s1', values=new Map();
 if(options.grant)values.set('sb_kiosk_holiday_grant_v1',JSON.stringify(options.grant));
 const requests=[];
 const state={view:'home',admin:{authed:!!options.manager,role:options.manager?'site':null,forcePasswordChange:false}};
 const session=options.manager?{access_token:'signed'}:null;
 let renderCount=0,loggedOut=false;
 const crypto={getRandomValues(array){array.fill(23);return array;}};
 const ctx={
  window:{crypto},
  crypto,
  state,
  _session:session,
  SUPABASE_URL:'https://example.invalid',
  SUPABASE_KEY:'public-test-key',
  getKioskSite:()=>site,
  siteName:id=>id==='s1'?'Seaham':'Peterlee',
  topstrip:()=>'<header>Shiftboard</header>',
  render:()=>{renderCount++;},
  signOutManager:()=>{loggedOut=true;state.admin.authed=false;state.view='home';ctx._session=null;},
  authHeaders:async()=>({Authorization:'Bearer signed',apikey:'public-test-key'}),
  localStorage:{
   getItem:key=>values.get(key)||null,
   setItem:(key,value)=>values.set(key,value),
   removeItem:key=>values.delete(key)
  },
  document:{
   createElement:()=>({textContent:''}),
   head:{appendChild:()=>{}},
   addEventListener:()=>{}
  },
  setInterval:()=>{},
  fetch:async(url,init)=>{
   const fn=url.split('/').pop(),args=JSON.parse(init.body);
   requests.push({fn,args,auth:init.headers.Authorization});
   const data=options.response?options.response(fn,args):{ok:true,siteId:site,month:args.p_month,entries:[],updatedAt:'2026-10-21T10:00:00Z'};
   return {ok:true,json:async()=>data};
  }
 };
 ctx.window.window=ctx.window;
 vm.runInNewContext(source,ctx,{filename:'kiosk-holiday-calendar.js'});
 return {api:ctx.window.shiftboardHolidayCalendar,requests,values,state,get renderCount(){return renderCount;},get loggedOut(){return loggedOut;}};
}


test('calendar opens immediately without manager login, PIN or enrolment',async()=>{
 const k=kiosk({response:(fn,args)=>({ok:true,siteId:'s1',month:args.p_month,updatedAt:'2026-10-21T11:00:00Z',entries:[]})});
 k.api.open();await flush();
 assert.equal(k.state.view,'kiosk-holidays');
 assert.equal(k.requests.length,1);
 assert.equal(k.requests[0].fn,'kiosk_holidays_month');
 assert.equal(k.requests[0].args.p_site_id,'s1');
 assert.ok(!Object.hasOwn(k.requests[0].args,'p_token'));
 assert.equal(k.requests[0].auth,'Bearer public-test-key');
 assert.match(k.api.view(),/Authorised Holidays/);
 assert.doesNotMatch(k.api.view(),/Manager setup|required to sign in|Enter PIN/);
});

test('approved colleague names are escaped and limited to kiosk site',async()=>{
 const k=kiosk({
  site:'s2',
  response:(fn,args)=>({ok:true,siteId:'s2',month:args.p_month,
   updatedAt:'2026-10-21T11:00:00Z',
   entries:[{date:args.p_month+'-23',name:'A <script>',unit:'days',amount:0.5}]})
 });
 k.api.open();await flush();
 assert.equal(k.requests[0].args.p_site_id,'s2');
 const view=k.api.view();
 assert.match(view,/Peterlee/);
 assert.match(view,/A &lt;script&gt;/);
 assert.doesNotMatch(view,/A <script>/);
 assert.match(view,/Authorised Holidays/);
 assert.doesNotMatch(view,/Manager sign in|Enable for this kiosk/);
});

test('invalid server result shows retry and no stale staff names',async()=>{
 let fail=false;
 const k=kiosk({response:(_fn,args)=>fail?
   {ok:false,error:'Calendar unavailable'}:
   {ok:true,siteId:'s1',month:args.p_month,entries:[{date:args.p_month+'-01',name:'Alex Staff',unit:'days',amount:1}]}});
 k.api.open();await flush();
 assert.match(k.api.view(),/Alex Staff/);
 fail=true;
 await k.api.load();
 assert.match(k.api.view(),/Calendar unavailable/);
 assert.match(k.api.view(),/Try again/);
 assert.doesNotMatch(k.api.view(),/Alex Staff/);
});

test('the public RPC returns only approved names/dates and no private employee fields',()=>{
 assert.match(sql,/kiosk_holidays_month\(p_site_id text, p_month text\)/);
 assert.match(sql,/r->>'status'='approved'/);
 assert.match(sql,/e->>'siteId'=p_site_id/);
 assert.match(sql,/coalesce\(\(e->>'active'\)::boolean,true\)/);
 assert.match(sql,/grant execute on function public\.kiosk_holidays_month\(text,text\) to anon, authenticated/);
 assert.doesNotMatch(sql,/kiosk_holidays_enrol|p_token|holiday_balance|pay_rate/);
 assert.doesNotMatch(source,/beginLogin|afterLogin|p_token|verifiedPin|localStorage/);
});

test('both deployed copies and HTML routes use no-login calendar',()=>{
 assert.equal(source,fs.readFileSync(__dirname+'/../kiosk-holiday-calendar.js','utf8'));
 for(const path of ['index.html','public/index.html']){
   const html=fs.readFileSync(__dirname+'/../'+path,'utf8');
   assert.match(html,/data-action="open-kiosk-holidays"/);
   assert.match(html,/state\.view==='kiosk-holidays'/);
   assert.match(html,/kiosk-holiday-calendar\.js\?v=2/);
   assert.match(html,/kiosk-holiday-retry/);
   assert.doesNotMatch(html,/kiosk-holiday-login|kiosk-holiday-enrol/);
 }
});
