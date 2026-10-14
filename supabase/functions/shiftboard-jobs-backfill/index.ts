import {pdfToText,parseReport} from "./parser.ts";
const URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const GRAPH="https://graph.microsoft.com/v1.0";
const TENANT="37fc2f44-6eb7-42b2-9c1f-792abab41652";
const CLIENT="79a5c576-5ded-4d41-95cb-48e514ba32c3";
const MAIL="tony@neautoservices.com";
const SENDERS:Record<string,string>={
 "seaham@neautoservices.com":"seaham",
 "peterlee@neautoservices.com":"peterlee",
 "middlesbrough@neautoservices.com":"middlesbrough",
 "hartlepool@neautoservices.com":"hartlepool",
 "gateshead@neautoservices.com":"gateshead",
 "fairfield@neautoservices.com":"fairfield",
 "chesterlestreet@neautoservices.com":"chester-le-street",
 "lido@neautoservices.com":"lido"
};
const SITES=Object.values(SENDERS);
function reply(status:number,obj:Record<string,unknown>){
 return Response.json(obj,{status,headers:{"Cache-Control":"no-store"}});
}
async function digest(bytes:Uint8Array|string):Promise<string>{
 const data=typeof bytes==="string"?new TextEncoder().encode(bytes):bytes;
 const buffer=new Uint8Array(await crypto.subtle.digest("SHA-256",data));
 return Array.from(buffer,b=>b.toString(16).padStart(2,"0")).join("");
}
async function rest(path:string,method="GET",value?:unknown,prefer?:string):Promise<any>{
 const h:Record<string,string>={apikey:KEY,Authorization:"Bearer "+KEY,Accept:"application/json"};
 if(value!==undefined)h["Content-Type"]="application/json";
 if(prefer)h.Prefer=prefer;
 const r=await fetch(URL+"/rest/v1/"+path,{method,headers:h,
  body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("storage_http_"+r.status);
 const b=await r.text();return b?JSON.parse(b):null;
}
function base64ToBytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function bytesToBase64(a:Uint8Array){return btoa(String.fromCharCode(...a));}
async function aesKey(){
 const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("shiftboard-jobs-ms-graph-v1:"+KEY));
 return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function decrypt(ciphertext:string,iv:string):Promise<string>{
 const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(iv)},
  await aesKey(),base64ToBytes(ciphertext));
 return new TextDecoder().decode(data);
}
async function encrypt(value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(),
  new TextEncoder().encode(value));
 return {encrypted_refresh_token:bytesToBase64(new Uint8Array(data)),refresh_iv:bytesToBase64(iv)};
}
async function accessToken(){
 const records=await rest("jobs_outlook_mailbox_connections?select=encrypted_refresh_token,refresh_iv&mailbox=eq."+
  encodeURIComponent(MAIL)+"&limit=1");
 if(!records.length)throw Error("tony_mailbox_not_connected");
 const refresh=await decrypt(records[0].encrypted_refresh_token,records[0].refresh_iv);
 const token=await fetch("https://login.microsoftonline.com/"+TENANT+"/oauth2/v2.0/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({client_id:CLIENT,grant_type:"refresh_token",refresh_token:refresh,scope:"offline_access Mail.Read User.Read"}),
  signal:AbortSignal.timeout(15000)});
 if(!token.ok)throw Error("microsoft_refresh_http_"+token.status);
 const t=await token.json();
 if(!t.access_token||!t.refresh_token)throw Error("microsoft_token_incomplete");
 const encoded=await encrypt(t.refresh_token);
 await rest("jobs_outlook_mailbox_connections?mailbox=eq."+encodeURIComponent(MAIL),"PATCH",
  {...encoded,last_verified_at:new Date().toISOString()},"return=minimal");
 return String(t.access_token);
}
async function graphGet(url:string,token:string,raw=false):Promise<any>{
 if(!url.startsWith(GRAPH+"/"))throw Error("graph_host_not_allowed");
 for(let n=0;n<3;n++){
  const resp=await fetch(url,{headers:{Authorization:"Bearer "+token},
   signal:AbortSignal.timeout(18000)});
  if(resp.ok){
   if(!raw)return resp.json();
   if(Number(resp.headers.get("content-length")||0)>8000000)throw Error("oversized_pdf");
   const bytes=new Uint8Array(await resp.arrayBuffer());
   if(bytes.length>8000000||new TextDecoder().decode(bytes.slice(0,4))!=="%PDF")
    throw Error("invalid_pdf_data");
   return bytes;
  }
  if([429,503].includes(resp.status)&&n<2){
   await new Promise(done=>setTimeout(done,1800*(n+1)));continue;
  }
  throw Error("graph_http_"+resp.status);
 }
}
async function graphList(url:string,token:string,cap:number){
 const results:any[]=[];let cursor=url;
 while(cursor){
  const data=await graphGet(cursor,token);
  results.push(...(data.value||[]));
  if(results.length>cap)throw Error("too_many_graph_results");
  cursor=data["@odata.nextLink"]||"";
 }
 return results;
}
async function sourceFolder(token:string){
 const folders=await graphList(GRAPH+"/me/mailFolders?$select=id,displayName,childFolderCount&$top=100",token,200);
 const match=folders.filter(f=>String(f.displayName||"").trim().toLowerCase()==="day sheets");
 if(match.length!==1)throw Error("day_sheets_folder_not_found");
 return match[0].id as string;
}
async function stage(report:any,mail:any,attachment:any):Promise<boolean>{
 const query="jobs_import_batches?select=id&site_key=eq."+report.site_key+
  "&report_date=eq."+report.report_date+"&source_sha256=eq."+report.source_sha256+"&limit=1";
 const existing=await rest(query);
 if(existing.length)return false;
 const rows=await rest("jobs_import_batches","POST",[{
  site_key:report.site_key,report_date:report.report_date,source_sha256:report.source_sha256,
  source_filename:String(attachment.name||"").slice(0,200),
  source_message_id:mail.id,source_attachment_id:attachment.id,
  source_received_at:mail.receivedDateTime,
  status:"staged",report_sales_ex_vat:report.report_sales_ex_vat,
  calculated_sales_ex_vat:report.calculated_sales_ex_vat,
  sales_reconciled:true,
  warnings:[{type:"service_repair_provisional",review_jobs:report.review_jobs}]
 }],"return=representation");
 const id=rows[0].id;
 if(!report.entries.length)throw Error("empty_report");
 await rest("jobs_import_entries","POST",
  report.entries.map((entry:any)=>({...entry,batch_id:id})),"return=minimal");
 return true;
}
async function processDay(day:string){
 const audits=await rest("jobs_backfill_run_audit","POST",[{report_day:day,status:"running"}],"return=representation");
 const id=audits[0].id;
 const errors:string[]=[],found=new Set<string>();
 let reports=0,inserted=0,messagesSeen=0;
 try{
  const token=await accessToken();
  const dayFolder=await sourceFolder(token);
  const until=new Date(day+"T00:00:00Z");until.setUTCDate(until.getUTCDate()+1);
  const end=until.toISOString().slice(0,10);
  for(const [source,folder] of [["days",dayFolder],["inbox","inbox"]]){
   const where="receivedDateTime ge "+day+"T00:00:00Z and receivedDateTime lt "+end+"T00:00:00Z";
   const query=new URLSearchParams({$select:"id,from,receivedDateTime,hasAttachments,subject",$filter:where,$top:"100"});
   const msgs=await graphList(GRAPH+"/me/mailFolders/"+encodeURIComponent(folder)+"/messages?"+query.toString(),token,100);
   messagesSeen+=msgs.length;
   for(const msg of msgs){
    const sender=String(msg.from?.emailAddress?.address||"").toLowerCase();
    const site=SENDERS[sender];
    if(!site||!msg.hasAttachments||(source==="inbox")!==(site==="lido"))continue;
    try{
     const path=GRAPH+"/me/messages/"+encodeURIComponent(msg.id);
     const list=await graphList(path+"/attachments?$select=id,name,size,isInline,contentType&$top=100",token,30);
     for(const a of list){
      if(a.isInline||!String(a.name||"").toLowerCase().endsWith(".pdf"))continue;
      if(Number(a.size)>8000000){errors.push(site+":oversized_pdf");continue;}
      try{
       const bytes=await graphGet(path+"/attachments/"+encodeURIComponent(a.id)+"/$value",token,true);
       const sha=await digest(bytes);
       const text=await pdfToText(bytes);
       const report=parseReport(text,site,sha);
       if(!report)continue;
       reports++;found.add(site);
       if(await stage(report,msg,a))inserted++;
      }catch(e){errors.push(site+":"+(e instanceof Error?e.message:"parse_error").slice(0,80));}
     }
    }catch(e){errors.push(site+":"+(e instanceof Error?e.message:"attachment_error").slice(0,80));}
   }
  }
  const status=errors.length?"partial":"completed";
  await rest("jobs_backfill_run_audit?id=eq."+id,"PATCH",{
   status,completed_at:new Date().toISOString(),reports_found:reports,
   reports_staged:inserted,messages_seen:messagesSeen,errors,
   details:{site_reports:Array.from(found).sort(),missing_sites:SITES.filter(x=>!found.has(x))}
  },"return=minimal");
  return {status,report_day:day,reports_found:reports,reports_staged:inserted,
   messages_seen:messagesSeen,error_count:errors.length};
 }catch(e){
  errors.push("runner:"+(e instanceof Error?e.message:"unexpected"));
  await rest("jobs_backfill_run_audit?id=eq."+id,"PATCH",{
   status:"failed",completed_at:new Date().toISOString(),reports_found:reports,
   reports_staged:inserted,messages_seen:messagesSeen,errors
  },"return=minimal");
  return {status:"failed",report_day:day,error_count:errors.length};
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 if(!URL||!KEY)return reply(503,{error:"missing_server_config"});
 const expected=await rest("jobs_backfill_runner_auth?select=internal_key&id=eq.1&limit=1");
 const provided=req.headers.get("x-shiftboard-run-key")||"";
 if(!/^[a-f0-9]{64}$/.test(provided)||
  await digest(provided)!==await digest(String(expected[0]?.internal_key||"")))
  return reply(403,{error:"unauthorized"});
 let input:any;try{input=await req.json();}catch{return reply(400,{error:"bad_json"});}
 const day=String(input.report_day||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<"2024-10-12"||day>new Date().toISOString().slice(0,10))
  return reply(400,{error:"invalid_day"});
 try{
  const result=await processDay(day);
  return reply(result.status==="failed"?500:200,result);
 }catch(e){
  console.error("backfill_error",e instanceof Error?e.name:"unknown");
  return reply(500,{error:"import_failed"});
 }
});
