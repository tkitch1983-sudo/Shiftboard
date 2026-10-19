const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/shiftboard-director-manual/index.ts','utf8'));
function harness(email='tony@neautoservices.com'){
 let handler,sendCount=0,stored=null;
 const fetch=async(url,opts={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user-id',email,app_metadata:{role:'super'}});
  if(url.includes('/functions/')){sendCount++;const body=JSON.parse(opts.body);assert.deepEqual(body,{date:'2026-10-19',send_test:true});return Response.json({status:'submitted',recipient:'tony@neautoservices.com'});}
  if(url.includes('sales_daily_snapshots?'))return Response.json([{snapshot_date:'2026-10-19'}]);
  if(url.includes('shiftboard_director_sales_daily_v?'))return Response.json([{site_name:'Hartlepool',import_status:'ok'}]);
  if(url.includes('shiftboard_digest_control?'))return Response.json([{secret:'server-only'}]);
  if(url.includes('director_manual_sends?')){
   if(opts.method==='POST'){if(stored)return Response.json([]);stored=JSON.parse(opts.body);return Response.json([stored]);}
   if(opts.method==='PATCH'){Object.assign(stored,JSON.parse(opts.body));return new Response(null,{status:204});}
   return Response.json(stored?[stored]:[]);
  }throw Error(url);
 };
 const context=vm.createContext({fetch,Response,Request,AbortSignal,crypto,TextEncoder,Uint8Array,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://db.test':'server-key'},serve:f=>handler=f}});
 vm.runInContext(source,context);
 return {count:()=>sendCount,call:body=>handler(new Request('https://fn.test',{method:'POST',headers:{Origin:'https://northeastautoservices.pages.dev',Authorization:'Bearer user-token'},body:JSON.stringify(body)}))};
}
test('other users cannot see or send director reports',async()=>{const h=harness('neil@example.com');assert.equal((await h.call({action:'status'})).status,403);assert.equal(h.count(),0);});
test('status does not send and no secrets are returned',async()=>{const h=harness();const r=await h.call({action:'status'});assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/server-only|server-key/);assert.equal(h.count(),0);});
test('confirmation required and changed snapshots rejected',async()=>{const h=harness();assert.equal((await h.call({action:'send'})).status,400);assert.equal((await h.call({action:'send',confirmed:true,snapshot_id:'old'})).status,409);assert.equal(h.count(),0);});
test('confirmed send is Tony-only and a second click cannot duplicate it',async()=>{const h=harness();const s=await(await h.call({action:'status'})).json();const body={action:'send',confirmed:true,snapshot_id:s.snapshot_id,to:'other@example.com'};assert.equal((await h.call(body)).status,200);assert.equal((await h.call(body)).status,409);assert.equal(h.count(),1);});
test('UI contains explicit confirmation, Tony gate and no secret',()=>{const ui=fs.readFileSync('director-email-prompt.js','utf8');assert.match(ui,/window.confirm/);assert.match(ui,/isTonyLogin/);assert.match(ui,/confirmed:true/);assert.doesNotMatch(ui,/x-shiftboard-digest-key|service_role/);});
