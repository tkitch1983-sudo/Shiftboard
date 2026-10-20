// Tony-only Autowork credential rotation. Never returns stored usernames or passwords.
// Existing GitHub Actions secrets remain active until each field is replaced in Vault.
const DB=Deno.env.get('SUPABASE_URL')||'';
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ORIGIN='https://northeastautoservices.pages.dev';
const SITES=new Set(['chester-le-street','fairfield','gateshead','hartlepool','lido','middlesbrough','peterlee','seaham']);
const HEADERS={'Access-Control-Allow-Origin':ORIGIN,
  'Access-Control-Allow-Headers':'authorization,apikey,content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Cache-Control':'no-store','Content-Type':'application/json',
  'X-Content-Type-Options':'nosniff','Vary':'Origin'};
function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
async function rpc(path:string,body:unknown){
  const r=await fetch(DB+'/rest/v1/rpc/'+path,{
    method:'POST',
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  if(!r.ok) throw Error('Credential service unavailable');
  return await r.json();
}
Deno.serve(async(req:Request)=>{
  // CORS is an extra guard; the checked Supabase user token is the actual authority.
  if(req.headers.get('Origin')!==ORIGIN) return reply(403,{error:'Invalid origin'});
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:HEADERS});
  if(req.method!=='POST') return reply(405,{error:'POST required'});
  try{
    if(!DB||!KEY)return reply(503,{error:'Credential service not configured'});
    const authorization=req.headers.get('Authorization')||'';
    if(!authorization.startsWith('Bearer '))return reply(401,{error:'Sign into Shiftboard first'});
    const userResponse=await fetch(DB+'/auth/v1/user',{
      headers:{apikey:KEY,Authorization:authorization},
      signal:AbortSignal.timeout(15000)
    });
    if(!userResponse.ok)return reply(401,{error:'Your session has expired. Sign in again'});
    const user=await userResponse.json();
    if(!user.id || String(user.email||'').toLowerCase()!=='tony@neautoservices.com' ||
       user.app_metadata?.role!=='super'){
      return reply(403,{error:'Only Tony may manage Autowork credentials'});
    }
    const raw=await req.text();
    if(raw.length>4096)return reply(413,{error:'Request too large'});
    const input=JSON.parse(raw);
    if(input.action==='status'){
      const rows=await rpc('shiftboard_autowork_credentials_status',{});
      return reply(200,{sites:rows});
    }
    if(input.action!=='save')return reply(400,{error:'Unknown action'});
    if(!SITES.has(input.site_key))return reply(400,{error:'Invalid workshop'});
    const username=input.username===undefined||input.username===null?'':input.username;
    const password=input.password===undefined||input.password===null?'':input.password;
    if(typeof username!=='string'||typeof password!=='string')return reply(400,{error:'Invalid credential fields'});
    if(!username&&!password)return reply(400,{error:'Enter a username, a password, or both'});
    if((username&&(!username.trim()||username.length>255)) ||
       (password&&(!password.trim()||password.length>512))){
      return reply(400,{error:'Invalid username or password length'});
    }
    const result=await rpc('shiftboard_autowork_credentials_set',{
      p_site_key:input.site_key,p_username:username||null,p_password:password||null,p_actor:user.id
    });
    return reply(200,{saved:true,site:result.site_key,
      username_configured:result.username_configured,password_configured:result.password_configured});
  }catch(_err){
    // Never echo database errors, authorization headers or credential values.
    return reply(502,{error:'Credential update could not be completed. Please try again.'});
  }
});
