const DB=Deno.env.get('SUPABASE_URL')||'';
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ORIGIN='https://northeastautoservices.pages.dev';
const RECIPIENT='tony@neautoservices.com';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
function reply(status:number,body:unknown){return Response.json(body,{status,headers});}
async function db(path:string,method='GET',body?:unknown,prefer?:string){
 const h:Record<string,string>={apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'};
 if(prefer)h.Prefer=prefer;
 const r=await fetch(DB+'/rest/v1/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Database unavailable');const text=await r.text();return text?JSON.parse(text):null;
}
async function snapshot(){
 const dates=await db('sales_daily_snapshots?select=snapshot_date&order=snapshot_date.desc&limit=1');
 const date=dates[0]?.snapshot_date;if(!date)return null;
 const rows=await db('shiftboard_director_sales_daily_v?select=snapshot_date,site_name,month_to_date,daily_sales_estimate,previous_snapshot_date,margin_current,import_status,add_on_value,add_on_count,davanti,itms_value,prior_year_mtd,comparison_available&snapshot_date=eq.'+date+'&order=site_name.asc');
 if(!rows.length)return null;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows)));
 const id=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 return {snapshot_id:id,report_date:date,reporting_sites:rows.filter((r:any)=>r.import_status==='ok').length,total_sites:rows.length,recipient:RECIPIENT};
}
Deno.serve(async(req:Request)=>{
 if(req.headers.get('Origin')!==ORIGIN)return reply(403,{error:'Invalid origin'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 let claimed:string|null=null;
 try{
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer '))return reply(401,{error:'Sign into Shiftboard first.'});
  const who=await fetch(DB+'/auth/v1/user',{headers:{apikey:KEY,Authorization:auth},signal:AbortSignal.timeout(15000)});
  if(!who.ok)return reply(401,{error:'Your session has expired. Please sign in again.'});
  const user=await who.json();
  if(!user.id||String(user.email||'').toLowerCase()!==RECIPIENT||user.app_metadata?.role!=='super')return reply(403,{error:'Only Tony can send this report.'});
  const raw=await req.text();if(raw.length>2048)return reply(413,{error:'Request too large'});
  const body=JSON.parse(raw);
  if(!['status','send'].includes(body.action))return reply(400,{error:'Unknown action'});
  const current=await snapshot();if(!current)return reply(404,{error:'No report data is available yet.'});
  const existing=(await db('director_manual_sends?select=status,requested_at,finished_at&snapshot_id=eq.'+current.snapshot_id))[0]||null;
  if(body.action==='status')return reply(200,{...current,last_send:existing});
  if(body.confirmed!==true)return reply(400,{error:'Confirm the recipient and report date before sending.'});
  if(body.snapshot_id!==current.snapshot_id)return reply(409,{error:'The report has changed. Check the latest report and confirm again.'});
  if(existing)return reply(409,{error:existing.status==='submitted'?'This version has already been submitted to Tony using this button.':'This version is already sending or its outcome needs checking. Check your inbox before retrying.',last_send:existing});
  const control=(await db('shiftboard_digest_control?select=secret&id=eq.true'))[0];
  if(!control?.secret)throw Error('Sender control unavailable');
  const claim=await db('director_manual_sends?on_conflict=snapshot_id','POST',{snapshot_id:current.snapshot_id,report_date:current.report_date,requested_by:user.id,status:'sending'},'resolution=ignore-duplicates,return=representation');
  if(!claim?.length)return reply(409,{error:'This report is already being sent.'});
  claimed=current.snapshot_id;
  const send=await fetch(DB+'/functions/v1/shiftboard-directors-sales-preview',{method:'POST',headers:{'Content-Type':'application/json','x-shiftboard-digest-key':control.secret},body:JSON.stringify({date:current.report_date,send_test:true}),signal:AbortSignal.timeout(60000)});
  const result=await send.json().catch(()=>({}));
  if(!send.ok||result.status!=='submitted'||result.recipient!==RECIPIENT)throw Error('Send outcome not confirmed');
  await db('director_manual_sends?snapshot_id=eq.'+claimed,'PATCH',{status:'submitted',finished_at:new Date().toISOString()});
  return reply(200,{status:'submitted',recipient:RECIPIENT,report_date:current.report_date,message:'Submitted to Outlook for delivery to Tony. Check your inbox.'});
 }catch(_e){
  if(claimed){try{await db('director_manual_sends?snapshot_id=eq.'+claimed,'PATCH',{status:'unknown',finished_at:new Date().toISOString()});}catch{}}
  return reply(502,{error:claimed?'Delivery outcome could not be confirmed. Check your inbox before retrying.':'Could not load the report. Please try again.'});
 }
});
