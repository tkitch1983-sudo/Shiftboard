const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const fs=require('node:fs');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/shiftboard-sender-connect/index.ts','utf8'));
const invite='a'.repeat(64), sid='11111111-1111-1111-1111-111111111111';
function harness(){
 let handler, writes=[];
 const ctx=vm.createContext({Response,Request,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,crypto,atob,btoa,AbortSignal,console,fetch:async()=>{throw Error('Unexpected fetch')},Deno:{env:{get:()=>''},serve:f=>handler=f}});
 vm.runInContext(source,ctx);
 return {ctx,writes,invoke:async(body,origin='https://northeastautoservices.pages.dev')=>handler(new Request('https://example.test',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('rejects wrong origin and invalid invitation before Microsoft calls',async()=>{
 const h=harness(); assert.equal((await h.invoke({action:'start'},'https://evil.test')).status,403);
 assert.equal((await h.invoke({action:'start',invite:'bad'})).status,403);
});
function mockPoll(h,mail,scope='User.Read Mail.Send'){
 h.ctx.db=async(path,method='GET',body)=>{
  if(method!=='GET'){h.writes.push({path,body});return [{id:sid}]}
  if(path.startsWith('sender_outlook_connect_invites?'))return [{id:sid,used_at:null}];
  if(path.startsWith('sender_outlook_connect_sessions?'))return [{id:sid,status:'pending',interval_seconds:5,expires_at:new Date(Date.now()+600000).toISOString()}];
  throw Error(path);
 };
 h.ctx.decrypt=async()=> 'mock-device';
 h.ctx.encrypt=async()=>({ciphertext:'encrypted',iv:'nonce'});
 h.ctx.msTokenPost=async()=>({response:{ok:true},payload:{scope,access_token:'mock',refresh_token:'mock-refresh'}});
 h.ctx.fetch=async(url)=>{assert.match(url,/graph.microsoft.com\/v1.0\/me\?/);return Response.json({mail,userPrincipalName:mail})};
}
test('rejects Tony account and does not persist sender credentials',async()=>{
 const h=harness();mockPoll(h,'tony@neautoservices.com');
 assert.equal((await h.invoke({action:'poll',invite,session_id:sid})).status,403);
 assert.equal(h.writes.some(x=>x.path.startsWith('sender_outlook_mailbox_connections')),false);
});
test('rejects read-only permission',async()=>{
 const h=harness();mockPoll(h,'shiftboard@neautoservices.com','User.Read Mail.Read');
 assert.equal((await h.invoke({action:'poll',invite,session_id:sid})).status,403);
 assert.equal(h.writes.some(x=>x.path.startsWith('sender_outlook_mailbox_connections')),false);
});
test('stores only correct sender encrypted credentials and never sends mail',async()=>{
 const h=harness();mockPoll(h,'shiftboard@neautoservices.com');
 const r=await h.invoke({action:'poll',invite,session_id:sid});
 assert.equal(r.status,200);assert.equal((await r.json()).mailbox,'shiftboard@neautoservices.com');
 const saved=h.writes.find(x=>x.path.startsWith('sender_outlook_mailbox_connections')).body[0];
 assert.equal(saved.encrypted_refresh_token,'encrypted');
 assert.equal(saved.mailbox,'shiftboard@neautoservices.com');
 assert.equal(h.writes.some(x=>x.path.startsWith('jobs_')),false);
});
test('lost success response can be polled again without exchanging tokens',async()=>{
 const h=harness();
 h.ctx.db=async path=>path.startsWith('sender_outlook_connect_invites?')?[{id:sid,used_at:'now'}]:[{id:sid,status:'connected'}];
 assert.equal((await h.invoke({action:'poll',invite,session_id:sid})).status,200);
});
function mockSend(h, opts={}){
 let state='not_sent', sends=[];
 h.ctx.db=async(path,method='GET',body)=>{
  if(method!=='GET'){
   if(path.includes('test_status=eq.not_sent') && state!=='not_sent')return [];
   if(body?.test_status)state=body.test_status;
   return [{id:sid}];
  }
  if(path.startsWith('sender_outlook_connect_invites?'))return [{id:sid,used_at:'now'}];
  if(path.startsWith('sender_outlook_connect_sessions?'))return [{id:sid,status:'connected',test_status:state}];
  if(path.startsWith('sender_outlook_mailbox_connections?'))return [{client_id:'79a5c576-5ded-4d41-95cb-48e514ba32c3',tenant_id:'37fc2f44-6eb7-42b2-9c1f-792abab41652'}];
  throw Error(path);
 };
 h.ctx.decrypt=async()=> 'mock-refresh';
 h.ctx.msTokenPost=async()=>({response:{ok:true},payload:{scope:'Mail.Send User.Read',access_token:'mock'}});
 h.ctx.fetch=async(url,init)=>{
  if(url.includes('/me?'))return Response.json({mail:opts.wrongSender?'other@example.com':'shiftboard@neautoservices.com'});
  assert.equal(url,'https://graph.microsoft.com/v1.0/me/sendMail');sends.push(JSON.parse(init.body));
  if(opts.timeout)throw Error('timeout');
  return new Response(null,{status:202});
 };
 return {sends,state:()=>state};
}
test('fixed HTML test ignores supplied recipients and cannot be sent twice',async()=>{
 const h=harness(),m=mockSend(h);
 const r=await h.invoke({action:'test',invite,to:'attacker@example.com',subject:'injected'});
 assert.equal(r.status,200);assert.equal((await r.json()).status,'accepted');
 assert.deepEqual(m.sends[0].message.toRecipients,[{emailAddress:{address:'tony@neautoservices.com'}}]);
 assert.equal(m.sends[0].message.body.contentType,'HTML');
 assert.equal(m.sends[0].message.subject,'Shiftboard — new email sender test');
 await h.invoke({action:'test',invite});assert.equal(m.sends.length,1);
});
test('identity mismatch prevents test send',async()=>{
 const h=harness(),m=mockSend(h,{wrongSender:true});
 assert.equal((await h.invoke({action:'test',invite})).status,502);assert.equal(m.sends.length,0);
});
test('ambiguous send is marked unknown and never retried',async()=>{
 const h=harness(),m=mockSend(h,{timeout:true});
 assert.equal((await h.invoke({action:'test',invite})).status,502);assert.equal(m.state(),'unknown');
 await h.invoke({action:'test',invite});assert.equal(m.sends.length,1);
});
