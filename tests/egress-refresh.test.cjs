const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const file of ['index.html','public/index.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const [,attrs,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  if(!attrs.includes('src=') && !attrs.includes('application/')) new vm.Script(code,{filename:file});
 }
 const readCode=html.slice(html.indexOf('let _lastKnownBin = null;'),html.indexOf('async function jsonbinWriteKey'));
 test(file+': unchanged reads preserve immutable server state and changed records replace it',async()=>{
  let server={config:{name:'original'}},hash='one';const hashes=[];
  const c=vm.createContext({SUPABASE_URL:'https://test.invalid',authHeaders:async()=>({Authorization:'Bearer A'}),fetch:async(url,opts)=>{
   const sent=JSON.parse(opts.body).p_hash;hashes.push(sent);
   return {ok:true,json:async()=>sent===hash?{hash,unchanged:true}:{hash,unchanged:false,record:structuredClone(server)}};
  }});
  vm.runInContext(readCode,c);
  const first=await c.jsonbinRead();first.config.name='unsaved mutation';
  assert.equal((await c.jsonbinRead()).config.name,'original');
  server={config:{name:'new server value'}};hash='two';
  assert.equal((await c.jsonbinRead()).config.name,'new server value');
  c.authHeaders=async()=>({Authorization:'Bearer B'});
  await c.jsonbinRead();assert.deepEqual(hashes,[null,'one','one',null]);
 });
 test(file+': offline pending changes override local and server snapshots',async()=>{
  const start=html.indexOf('async function storageReadRecord');
  const code=html.slice(start,html.indexOf('async function storageSet',start));
  const c=vm.createContext({console:{error(){}},trySyncPending:async()=>{},jsonbinRead:async()=>{throw Error('offline')},_lastKnownBin:{clockEvents:['old'],config:{}},readLocalRecord:()=>({clockEvents:['local']}),readPendingChanges:()=>({clockEvents:['pending']}),writeLocalRecord(){}});
  vm.runInContext(code,c);assert.equal((await c.storageGet('clockEvents',[]))[0],'pending');assert.equal(await c.storageGet('missing','fallback'),'fallback');
 });
 test(file+': screen load reads one snapshot and background polling skips hidden tabs',async()=>{
  const start=html.indexOf('async function loadAll(){');
  const part=html.slice(start,html.indexOf('  if(!Array.isArray(state.requests))',start));
  let reads=0;
  const c=vm.createContext({_session:null,state:{admin:{}},storageReadRecord:async()=>{reads++;return {config:{sites:[]},holidayRequests:[{id:'r'}],clockEvents:[{id:'e'}]};},DEFAULT_CONFIG:()=>({sites:[],employees:[],siteManagers:[],admins:[],bankHolidays:[]}),canAccessBonusSheet:()=>false});
  vm.runInContext(part+'}',c);await c.loadAll();assert.equal(reads,1);assert.equal(c.state.events[0].id,'e');assert.equal(c.state.requests[0].id,'r');
  const interval=html.slice(html.indexOf('  let refreshInFlight = false;'),html.indexOf('  // Also refresh the moment'));
  let callback;const p=vm.createContext({document:{visibilityState:'hidden'},setInterval:fn=>{callback=fn;},state:{view:'admin',admin:{tab:'register'}},_session:{},sessionExpired:()=>false,jsonbinRead:async()=>{throw Error('should not fetch while hidden')}});
  vm.runInContext(interval,p);await callback();
 });
}
