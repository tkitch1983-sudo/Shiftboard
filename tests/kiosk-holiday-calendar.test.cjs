'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('both published calendars and inline app scripts are syntactically valid',()=>{
 for(const rel of ['kiosk-holiday-calendar.js','public/kiosk-holiday-calendar.js']){
   new Function(fs.readFileSync(path.join(root,rel),'utf8'));
 }
 assert.equal(fs.readFileSync(path.join(root,'kiosk-holiday-calendar.js'),'utf8'),
   fs.readFileSync(path.join(root,'public/kiosk-holiday-calendar.js'),'utf8'));
 for(const rel of ['index.html','public/index.html']){
   const html=fs.readFileSync(path.join(root,rel),'utf8');
   const inline=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
   inline.forEach(s=>new Function(s));
   assert.match(html,/data-action="open-kiosk-holidays"/);
   assert.match(html,/src="\.\/kiosk-holiday-calendar\.js\?v=2"/);
   assert.match(html,/data-action==='kiosk-holiday-retry'/);
   assert.doesNotMatch(html,/kiosk-holiday-(login|enrol)/);
 }
});

test('one-tap kiosk opens approved calendar without login; shows only selected site and escapes staff names',async()=>{
 const code=fs.readFileSync(path.join(root,'public/kiosk-holiday-calendar.js'),'utf8');
 const history=[],site={id:'s2'},state={view:'home',admin:{authed:false,error:''}};
 const document={head:{appendChild(){}},createElement(){return {textContent:''};},addEventListener(){}};
 const month=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
 const date=month+'-23';
 const fakeFetch=async(url,options)=>{
   const action=url.split('/').at(-1),body=JSON.parse(options.body);
   history.push({action,body});
   assert.equal(action,'kiosk_holidays_month');
   assert.equal(body.p_token,undefined,'no token or staff PIN must be required');
   return {ok:true,json:async()=>({
      ok:true,siteId:body.p_site_id,month:body.p_month,updatedAt:'2026-10-21T11:00:00Z',
      entries:body.p_site_id==='s2'?[
        {date,name:'<img onerror=alert(1)>',amount:0.5,unit:'days'},
        {date,name:'Colleague B',amount:4.5,unit:'hours'}
      ]:[{date,name:'Different site colleague',amount:1,unit:'days'}]
   })};
 };
 const run=new Function('window','document','state','getKioskSite','siteName',
   'SUPABASE_URL','SUPABASE_KEY','fetch','render','setInterval','topstrip',code);
 const window={};
 run(window,document,state,()=>site.id,()=>'Test Site','https://example.test','key',
   fakeFetch,()=>{},()=>{},()=>'');
 const c=window.shiftboardHolidayCalendar;
 c.open();await flush();
 assert.equal(state.view,'kiosk-holidays');
 assert.equal(history.length,1);
 assert.equal(history[0].body.p_site_id,'s2');
 assert.doesNotMatch(c.view(),/Manager sign in|Manager setup required/);
 assert.match(c.view(),/&lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(c.view(),/<img onerror=alert\(1\)>/);
 c.choose(date);
 assert.match(c.view(),/½ day/);
 assert.match(c.view(),/4.5 hours/);
 site.id='s1';
 c.open(); // A new site must clear previously visible staff immediately.
 assert.doesNotMatch(c.view(),/Colleague B/);
 await flush();
 assert.match(c.view(),/Different site colleague/);
 assert.doesNotMatch(c.view(),/Colleague B/);
 assert.equal(history.at(-1).body.p_site_id,'s1');
});
