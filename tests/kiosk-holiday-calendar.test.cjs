'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/kiosk-holiday-calendar.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'database/051_one_tap_kiosk_holidays.sql'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function kiosk(options={}){
  const device={site:options.site||'s1'};
  const requests=[];
  const state={view:'home',admin:{authed:false}};
  const context={
    window:{}, state,
    SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'public-test-key',
    getKioskSite:()=>device.site,
    siteName:id=>id==='s1'?'Seaham':'Peterlee',
    topstrip:()=>'<header>Shiftboard</header>',
    render:()=>{},
    document:{
      createElement:()=>({textContent:''}),
      head:{appendChild:()=>{}},
      addEventListener:()=>{}
    },
    setInterval:()=>{},
    fetch:async(url,init)=>{
      const fn=url.split('/').pop(),args=JSON.parse(init.body);
      requests.push({fn,args,auth:init.headers.Authorization});
      if(options.offline)throw new Error('offline');
      const data=options.response?options.response(fn,args):{
        ok:true,siteId:args.p_site_id,month:args.p_month,
        entries:[],updatedAt:'2026-10-21T10:00:00Z'
      };
      return {ok:true,json:async()=>data};
    }
  };
  vm.runInNewContext(source,context,{filename:'kiosk-holiday-calendar.js'});
  return {api:context.window.shiftboardHolidayCalendar,device,requests,state};
}

test('root and deployed calendar files match and app JavaScript has valid syntax',()=>{
  new Function(source);
  const rootCalendar=fs.readFileSync(path.join(root,'kiosk-holiday-calendar.js'),'utf8');
  assert.equal(rootCalendar,source);
  for(const rel of ['index.html','public/index.html']){
    const html=fs.readFileSync(path.join(root,rel),'utf8');
    const inline=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
    inline.forEach(js=>new Function(js));
    assert.match(html,/data-action="open-kiosk-holidays"/);
    assert.match(html,/src="\.\/kiosk-holiday-calendar\.js\?v=2"/);
    assert.match(html,/action==='kiosk-holiday-retry'/);
    assert.doesNotMatch(html,/kiosk-holiday-(login|enrol)/);
  }
});

test('kiosk opens a live calendar without staff PIN, manager sign-in or device enrolment',async()=>{
  const k=kiosk();k.api.open();await flush();
  assert.equal(k.state.view,'kiosk-holidays');
  assert.equal(k.requests.length,1);
  assert.equal(k.requests[0].fn,'kiosk_holidays_month');
  assert.equal(k.requests[0].args.p_site_id,'s1');
  assert.equal(k.requests[0].args.p_token,undefined);
  assert.equal(k.requests[0].auth,'Bearer public-test-key');
  assert.doesNotMatch(k.api.view(),/Manager setup required|Manager sign in/);
  assert.match(k.api.view(),/Authorised Holidays/);
});

test('month navigation reads the new month at the kiosk site',async()=>{
  const k=kiosk();k.api.open();await flush();
  const initial=k.requests[0].args.p_month;
  k.api.change(1);await flush();
  assert.equal(k.requests.length,2);
  assert.notEqual(k.requests[1].args.p_month,initial);
  assert.equal(k.requests[1].args.p_site_id,'s1');
});

test('calendar escapes names, shows partial leave and never carries old site names across',async()=>{
  const today=new Date(),month=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  const date=month+'-23';
  const k=kiosk({response:(fn,args)=>({
    ok:true,siteId:args.p_site_id,month:args.p_month,
    updatedAt:'2026-10-21T10:00:00Z',
    entries:args.p_site_id==='s1'?[
      {date:args.p_month+'-23',name:'Person <img onerror=alert(1)>',unit:'days',amount:0.5},
      {date:args.p_month+'-23',name:'Colleague B',unit:'hours',amount:4.5}
    ]:[{date:args.p_month+'-23',name:'Peterlee Person',unit:'days',amount:1}]
  })});
  k.api.open();await flush();
  assert.match(k.api.view(),/Person &lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(k.api.view(),/<img onerror=alert\(1\)>/);
  k.api.choose(date);
  assert.match(k.api.view(),/½ day/);
  assert.match(k.api.view(),/4.5 hours/);
  k.device.site='s2';
  k.api.open();
  assert.doesNotMatch(k.api.view(),/Colleague B/);
  await flush();
  assert.match(k.api.view(),/Peterlee Person/);
  assert.doesNotMatch(k.api.view(),/Colleague B/);
  assert.equal(k.requests.at(-1).args.p_site_id,'s2');
});

test('offline calendar displays a retry action, not stale approval information',async()=>{
  const k=kiosk({offline:true});
  k.api.open();await flush();
  assert.match(k.api.view(),/Calendar unavailable/);
  assert.match(k.api.view(),/Try again/);
  assert.doesNotMatch(k.api.view(),/Updated/);
});

test('read-only migration projects only site-approved holiday names and dates',()=>{
  assert.match(migration,/create or replace function public\.kiosk_holidays_month\(p_site_id text, p_month text\)/);
  assert.match(migration,/r->>'status'='approved'/);
  assert.match(migration,/e->>'siteId'=p_site_id/);
  assert.match(migration,/jsonb_build_object\(\s*'date',date_iso,'name',display_name,'amount',amount,'unit',unit/s);
  assert.match(migration,/grant execute on function public\.kiosk_holidays_month\(text,text\) to anon, authenticated/);
  assert.doesNotMatch(migration,/grant execute on function public\.kiosk_holidays_enrol/);
});
