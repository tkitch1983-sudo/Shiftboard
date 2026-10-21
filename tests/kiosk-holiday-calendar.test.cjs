'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('published kiosk code and inline app syntax are valid',()=>{
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
   assert.match(html,/src="\.\/kiosk-holiday-calendar\.js\?v=1"/);
 }
});

test('calendar requires manager enrollment, escapes names and stays in kiosk site',async()=>{
 const code=fs.readFileSync(path.join(root,'public/kiosk-holiday-calendar.js'),'utf8');
 const stored=new Map(),history=[],site={id:'s2'},state={view:'home',admin:{authed:false,error:''}};
 const win={crypto:{getRandomValues(bytes){bytes.fill(9);return bytes;}}};
 const doc={head:{appendChild(){}},createElement(){return {textContent:''};},addEventListener(){}};
 let loggedOut=false;
 const fakeFetch=async(url,options)=>{
   const action=url.split('/').at(-1),body=JSON.parse(options.body);
   history.push({action,body});
   const result=action==='kiosk_holidays_enrol'?{ok:true,siteId:body.p_site_id}:
     action==='kiosk_holidays_month'?{ok:body.p_site_id==='s2',siteId:body.p_site_id,month:body.p_month,updatedAt:'2026-10-21T11:00:00Z',entries:[
       {date:'2026-10-23',name:'<img onerror=alert(1)>',amount:0.5,unit:'days'},
       {date:'2026-10-23',name:'Colleague B',amount:4.5,unit:'hours'}
     ]}:{ok:true};
   return {ok:true,json:async()=>result};
 };
 const run=new Function('window','document','state','getKioskSite','siteName','_session',
   'authHeaders','SUPABASE_URL','SUPABASE_KEY','fetch','crypto','signOutManager',
   'render','setInterval','localStorage','topstrip',code);
 run(win,doc,state,()=>site.id,()=>'Test Site',{role:'site',siteId:'s2'},
   async()=>({Authorization:'Bearer manager',apikey:'key'}),'https://example.test','key',
   fakeFetch,win.crypto,()=>{loggedOut=true;state.admin.authed=false;state.view='home';},
   ()=>{},()=>{},{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},()=>'');
 const c=win.shiftboardHolidayCalendar;
 c.open();
 assert.match(c.view(),/Manager sign in/);
 assert.equal(history.length,0,'unregistered kiosk cannot request holiday records');
 c.beginLogin();state.admin.authed=true;
 assert.equal(c.afterLogin(),true);
 assert.match(c.view(),/Enable for this kiosk/);
 await c.enrol();
 assert.equal(loggedOut,true,'manager must be signed out after enrollment');
 assert.equal(stored.size,1);
 assert(history.some(c=>c.action==='kiosk_holidays_month'&&c.body.p_site_id==='s2'));
 assert.match(c.view(),/&lt;img onerror=alert\(1\)&gt;/,'employee names must be escaped');
 assert.doesNotMatch(c.view(),/<img onerror=alert\(1\)>/);
 c.choose('2026-10-23');
 assert.match(c.view(),/½ day/);
 assert.match(c.view(),/4.5 hours/);
 site.id='s1';
 assert.match(c.view(),/Manager setup required/);
 assert.doesNotMatch(c.view(),/Colleague B/);
});
