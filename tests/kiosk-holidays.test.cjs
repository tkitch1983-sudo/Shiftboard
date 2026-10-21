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

test('unregistered kiosk shows manager authorisation, never calls employee data RPC',()=>{
 const k=kiosk();
 k.api.open();
 assert.match(k.api.view(),/Manager setup required/);
 assert.match(k.api.view(),/Manager sign in/);
 assert.equal(k.requests.length,0);
});

test('token bound to another site is rejected locally',async()=>{
 const k=kiosk({site:'s2',grant:{siteId:'s1',token:'f'.repeat(64)}});
 k.api.open();await flush();
 assert.equal(k.requests.length,0);
 assert.match(k.api.view(),/Manager setup required/);
});

test('registered site fetches just its month and safely escapes a colleague name',async()=>{
 const token='c'.repeat(64);
 const k=kiosk({
  grant:{siteId:'s1',token},
  response:(fn,args)=>({ok:true,siteId:'s1',month:args.p_month,updatedAt:'2026-10-21T11:00:00Z',
   entries:[{date:'2026-10-23',name:'A <script>',unit:'days',amount:0.5}]})
 });
 k.api.open();await flush();
 assert.equal(k.requests[0].fn,'kiosk_holidays_month');
 assert.equal(k.requests[0].args.p_site_id,'s1');
 assert.equal(k.requests[0].args.p_token,token);
 const view=k.api.view();
 assert.match(view,/A &lt;script&gt;/);
 assert.ok(!view.includes('A <script>'));
 assert.match(view,/Authorised Holidays/);
});

test('one-time manager enrolment registers a device token then signs out',async()=>{
 const k=kiosk({manager:true});
 k.api.open();
 await k.api.enrol();await flush();
 assert.equal(k.requests[0].fn,'kiosk_holidays_enrol');
 assert.equal(k.requests[0].args.p_site_id,'s1');
 assert.match(k.requests[0].args.p_token,/^[0-9a-f]{64}$/);
 assert.equal(k.requests[0].auth,'Bearer signed');
 assert.equal(k.requests[1].fn,'kiosk_holidays_month');
 assert.equal(k.loggedOut,true);
 assert.ok(k.values.has('sb_kiosk_holiday_grant_v1'));
});

test('mandatory first password change cannot be bypassed by kiosk setup login',()=>{
 const k=kiosk();
 k.api.beginLogin();
 assert.equal(k.state.view,'admin-pin');
 k.state.admin.forcePasswordChange=true;
 assert.equal(k.api.afterLogin(),false);
 assert.equal(k.state.view,'admin-pin');
});

test('database function requires real site grant and filters approved requests',()=>{
 assert.match(sql,/token_hash=encode\(sha256/);
 assert.match(sql,/and g\.site_id=p_site_id and g\.revoked_at is null/);
 assert.match(sql,/r->>'status'='approved'/);
 assert.match(sql,/e->>'siteId'=p_site_id/);
 assert.match(sql,/revoke all on public\.kiosk_holiday_site_grants/);
 assert.match(sql,/grant execute on function public\.kiosk_holidays_enrol\(text,text\) to authenticated/);
 assert.match(sql,/grant execute on function public\.kiosk_holidays_month\(text,text,text\) to anon, authenticated/);
});
