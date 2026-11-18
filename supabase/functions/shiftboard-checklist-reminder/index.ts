// Initial rollout: only Tony receives any test messages. No site email until separately enabled.
const LIVE_ENABLED=false;
const ROOT=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGIN="https://northeastautoservices.pages.dev";
const TONY="tony@neautoservices.com";
const IDs=["s1","s2","s3","s4","s5","s6","s7","s8"];
const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
const reply=(status,body)=>Response.json(body,{status,headers});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const WEEKS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const OXY=['cylinders_upright','cylinder_key','fire_gloves','ppe_suitable',
  'regulators_type_date','connection_nuts','oxygen_regulator_clean','flashback_arrestors',
  'hoses_good','clips_factory','spliced_hoses_checked','torch_condition','nozzle_seated'];
 const CARS=['rubbish','dashboard','centre_console','doors_pockets','steering_wheel','gear_stick',
  'seats_wipe','carpets','seats_hoover','mats','boot_space','outside','wheels_trims','windows','wipers'];
 function loanCarRequired(siteId){return siteId==='s5'||siteId==='s7';}
 function weeklyComplete(r,siteId){
  if(!r||!r.weekly_timesheet_done)return false;
  const days=(r.site_cleaning_form&&r.site_cleaning_form.days)||{};
  const cleaning=WEEKS.every(day=>{
   const d=days[day]||{};
   return ['reception','office','toilets','mess','signature'].every(k=>!!String(d[k]||'').trim());
  });
  if(!cleaning||!(Array.isArray(r.stock_files)&&r.stock_files.length>0))return false;
  const oxy=r.oxy_acetylene_form||{},ans=oxy.answers||{},notes=oxy.item_notes||{};
  if(!String(oxy.completed_by||'').trim()||!OXY.every(k=>!!String(ans[k]||'').trim()))return false;
  const negatives=OXY.filter(k=>ans[k]==='no');
  if(negatives.length && !String(oxy.notes||'').trim() &&
   !negatives.some(k=>!!String(notes[k]||'').trim()))return false;
  if(!loanCarRequired(siteId))return true;
  const car=r.car_cleaning_form||{},cars=Array.isArray(car.cars)?car.cars:[];
  if(car.enabled===false||car.no_cars===true)return true;
  const first=cars[0]||{};
  return !!String(car.completed_by||'').trim() && !!String(first.reg||'').trim() &&
   cars.filter(x=>x&&String(x.reg||'').trim()).every(x=>CARS.every(k=>!!String((x.items||{})[k]||'').trim()));
 }

const enc=new TextEncoder(), bytes=s=>enc.encode(s), b64=a=>btoa(String.fromCharCode(...a));
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function db(path,method="GET",body,prefer="return=representation"){
 const res=await fetch(ROOT+"/rest/v1/"+path,{method,headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json",Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok)throw Error("Database request "+res.status+" "+path.split("?")[0]);
 const txt=await res.text();return txt?JSON.parse(txt):[];
}
async function graphToken(){
 const m=(await db("sender_outlook_mailbox_connections?select=*&mailbox=eq.shiftboard@neautoservices.com&limit=1"))[0];
 if(!m)throw Error("Sender mailbox unavailable");
 const hash=await crypto.subtle.digest("SHA-256",bytes("shiftboard-sender-ms-graph-v1:"+KEY));
 const key=await crypto.subtle.importKey("raw",hash,{name:"AES-GCM"},false,["decrypt","encrypt"]);
 const refresh=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:from64(m.refresh_iv)},key,from64(m.encrypted_refresh_token)));
 const form=new URLSearchParams({client_id:m.client_id,grant_type:"refresh_token",refresh_token:refresh,scope:"offline_access User.Read Mail.Send"});
 const resp=await fetch("https://login.microsoftonline.com/"+m.tenant_id+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
 const t=await resp.json();if(!resp.ok||!t.access_token)throw Error("Microsoft sender authentication failed");
 if(t.refresh_token){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes(t.refresh_token)));
  await db("sender_outlook_mailbox_connections?mailbox=eq.shiftboard@neautoservices.com","PATCH",{encrypted_refresh_token:b64(encrypted),refresh_iv:b64(iv),last_verified_at:new Date().toISOString()});
 }
 return t.access_token;
}

function periods(now=new Date()){
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const part=k=>date.find(x=>x.type===k).value;
 const today=part("year")+"-"+part("month")+"-"+part("day");
 const monday=new Date(today+"T12:00:00Z");
 monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 return {today,week:monday.toISOString().slice(0,10),month:today.slice(0,7)+"-01"};
}
async function snapshot(){
 const {today,week,month}=periods();
 const [sites,weekly,monthly,history]=await Promise.all([
 db("shiftboard_site_email_recipients?select=site_id,site_name,email,enabled,verified_at&site_id=in.("+IDs.join(",")+")"),
 db("weekly_site_checks?select=*&week_start=eq."+week),
 db("monthly_hs_checks?select=site_id,status&month_start=eq."+month),
 db("shiftboard_checklist_reminder_log?select=site_id,mode,status,requested_at,finished_at&reminder_date=eq."+today)
 ]);
 const w=new Map(weekly.map(x=>[x.site_id,x])),m=new Map(monthly.map(x=>[x.site_id,x]));
 const rows=sites.map(s=>({id:s.site_id,name:s.site_name,email:s.email,eligible:!!s.email&&s.enabled===true&&!!s.verified_at,items:[!weeklyComplete(w.get(s.site_id),s.site_id)?"Weekly workshop checks":null,m.get(s.site_id)?.status!=="published"?"Monthly H&S checks":null].filter(Boolean),last:history.find(x=>x.site_id===s.site_id&&x.mode===(LIVE_ENABLED?"live":"test"))||null}));
 return {today,week,month,rows};
}
async function sendMail(token,row,period,recipient){
 const subject=(LIVE_ENABLED?"":"TEST | ")+"Shiftboard checklist reminder - "+row.name;
 const html='<main style="font-family:Arial,sans-serif;color:#28323d;max-width:600px;padding:24px;border-top:8px solid #b7192b"><h1 style="color:#b7192b">SHIFTBOARD</h1>'+(!LIVE_ENABLED?"<p><b>TEST ONLY – no workshop has received this email.</b></p>":"")+'<h2>Checklist reminder</h2><p>Hello '+esc(row.name)+' team,</p><p>Our current records show the following checks are outstanding:</p><ul>'+row.items.map(i=>"<li>"+esc(i)+"</li>").join("")+"</ul><p>Week commencing: "+esc(period.week)+"<br>Monthly period: "+esc(period.month.slice(0,7))+'</p><p>Please complete the outstanding checks in Shiftboard. If you have just completed these, please disregard this reminder.</p><p><a href="'+ORIGIN+'/" style="background:#b7192b;color:#fff;padding:12px;text-decoration:none">Open Shiftboard</a></p><p>Thank you,<br>Upper Management</p></main>';
 const r=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({message:{subject,body:{contentType:"HTML",content:html},toRecipients:[{emailAddress:{address:recipient}}]},saveToSentItems:true}),signal:AbortSignal.timeout(20000)});
 if(r.status!==202)throw Error("Graph submission not accepted");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(405,{error:"POST required"});
 try{
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return reply(401,{error:"Sign in first"});
  const who=await fetch(ROOT+"/auth/v1/user",{headers:{apikey:KEY,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!who.ok)return reply(401,{error:"Sign in again"});
  const actor=await who.json();
  if(!actor.id||actor.app_metadata?.role!=="super")return reply(403,{error:"Upper Management only"});
  const raw=await req.text();if(raw.length>1024)return reply(413,{error:"Request too large"});
  const body=JSON.parse(raw);
  if(!["status","send"].includes(body.action))return reply(400,{error:"Unknown action"});
  const s=await snapshot();
  const mode=LIVE_ENABLED?"live":"test";
  if(body.action==="status")return reply(200,{mode,week:s.week,month:s.month,rows:s.rows.map(({email,...r})=>r)});
  if(body.week!==s.week||body.month!==s.month)return reply(409,{error:"Checklist period changed. Refresh first."});
  if(!IDs.includes(body.site_id)&&body.site_id!=="all")return reply(400,{error:"Invalid site"});
  if(!LIVE_ENABLED&&body.site_id==="all")return reply(409,{error:"Bulk sending is disabled during Tony-only testing."});
  const due=s.rows.filter(r=>(body.site_id==="all"||r.id===body.site_id)&&r.items.length);
  if(!due.length)return reply(200,{mode,results:[],message:"No outstanding checks"});
  let token=null;const results=[];
  for(const row of due){
   if(!row.eligible&&LIVE_ENABLED){results.push({id:row.id,name:row.name,status:"unverified"});continue;}
   const recipient=LIVE_ENABLED?row.email:TONY;
   if(row.last){results.push({id:row.id,name:row.name,status:row.last.status==="submitted"?"already_submitted":"already_claimed"});continue;}
   // Authenticate the sender before claiming, so connection failures can safely be retried.
   token ||=await graphToken();
   const claim=await db("shiftboard_checklist_reminder_log?on_conflict=reminder_date,site_id,mode","POST",{reminder_date:s.today,site_id:row.id,mode,recipient_email:recipient,requested_by:actor.id,week_start:s.week,month_start:s.month,items:row.items,status:"claimed"},"resolution=ignore-duplicates,return=representation");
   if(!claim.length){results.push({id:row.id,name:row.name,status:"already_claimed"});continue;}
   const filter="shiftboard_checklist_reminder_log?reminder_date=eq."+s.today+"&site_id=eq."+row.id+"&mode=eq."+mode;
   try{
    await sendMail(token,row,s,recipient);
    await db(filter,"PATCH",{status:"submitted",finished_at:new Date().toISOString()});
    results.push({id:row.id,name:row.name,status:"submitted"});
   }catch{
    await db(filter,"PATCH",{status:"uncertain",finished_at:new Date().toISOString()}).catch(()=>{});
    results.push({id:row.id,name:row.name,status:"uncertain"});
   }
  }
  return reply(200,{mode,results});
 }catch{return reply(502,{error:"Unable to process reminder. Refresh status before retrying."});}
});