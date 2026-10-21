'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('published kiosk code and inline app syntax are valid',()=>{
 for(const rel of ['kiosk-holiday-calendar.js','public/kiosk-holiday-calendar.js'])
   new Function(read(rel));
 assert.equal(read('kiosk-holiday-calendar.js'),read('public/kiosk-holiday-calendar.js'));
 for(const rel of ['index.html','public/index.html']){
   const html=read(rel);
   [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean).forEach(s=>new Function(s));
   assert.match(html,/data-action="open-kiosk-holidays"/);
   assert.match(html,/src="\.\/kiosk-holiday-calendar\.js\?v=2"/);
   assert.doesNotMatch(html,/kiosk-holiday-enrol|kiosk-holiday-login/);
 }
});

test('one tap opens an approved, read-only site calendar with no manager/PIN',async()=>{
 const code=read('public/kiosk-holiday-calendar.js');
 const history=[],site={id:'s2'},state={view:'home'};
 const doc={head:{appendChild(){}},createElement(){return {textContent:''};},addEventListener(){}};
 const fakeFetch=async(url,options)=>{
   const action=url.split('/').at(-1),body=JSON.parse(options.body);
   history.push({action,body});
   const result={ok:true,siteId:body.p_site_id,month:body.p_month,updatedAt:'2026-10-21T11:00:00Z',
     entries:body.p_site_id==='s2'?[
      {date:body.p_month+'-23',name:'<img onerror=alert(1)>',amount:0.5,unit:'days'},
      {date:body.p_month+'-23',name:'Colleague B',amount:4.5,unit:'hours'}]:
      [{date:body.p_month+'-23',name:'Other Site Person',amount:1,unit:'days'}]
   };
   return {ok:true,json:async()=>result};
 };
 const win={};
 const run=new Function('window','document','state','getKioskSite','siteName','SUPABASE_URL','SUPABASE_KEY','fetch','render','setInterval','topstrip',code);
 run(win,doc,state,()=>site.id,()=>site.id==='s2'?'Peterlee':'Seaham','https://example.test','public-key',
   fakeFetch,()=>{},()=>{},()=>'');
 const c=win.shiftboardHolidayCalendar;
 c.open();
 await c.load();
 assert.equal(state.view,'kiosk-holidays');
 assert(history.some(x=>x.action==='kiosk_holidays_month'&&x.body.p_site_id==='s2'));
 assert(history.every(x=>!('p_token' in x.body)));
 assert.match(c.view(),/&lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(c.view(),/<img onerror=alert\(1\)>/);
 assert.doesNotMatch(c.view(),/Manager sign in|Manager setup required|Enter PIN/);
 c.choose(history.at(-1).body.p_month+'-23');
 assert.match(c.view(),/½ day/);
 assert.match(c.view(),/4.5 hours/);
 site.id='s1';
 await c.load();
 assert.match(c.view(),/Other Site Person/);
 assert.doesNotMatch(c.view(),/Colleague B/);
});
