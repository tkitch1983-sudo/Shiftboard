/* Tony-only manual send control. The backend rechecks identity and fixes the recipient. */
(function(){
 'use strict';
 if(typeof renderTonyDashboard!=='function')return;
 const original=renderTonyDashboard;
 let busy=false,message='',loaded=null;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowed=()=>typeof isTonyLogin==='function'&&isTonyLogin()&&state.admin.authed;
 const dateLabel=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
 function panel(){
  if(!allowed())return '';
  return '<section class="card no-print" id="director-email-card" style="border-left:4px solid var(--amber);margin:16px 0">'+
   '<h2 style="font-size:22px">Director email</h2><p style="color:var(--muted);font-size:13px;line-height:1.6">Sales &amp; Profit Tracker · From shiftboard@neautoservices.com · <b>To Tony only</b><br>Check the latest Autowork report, then confirm to send. No other directors will be emailed.</p>'+
   '<button type="button" class="btn-sm" data-director-email="check" '+(busy?'disabled':'')+'>'+ (busy?'Please wait…':'Check latest report & send to Tony')+'</button> '+
   '<div role="status" aria-live="polite" style="margin-top:12px;font-size:13px;line-height:1.6">'+esc(message||'Nothing is sent until you confirm.')+'</div></section>';
 }
 renderTonyDashboard=function(){return panel()+original.apply(this,arguments);};
 async function api(body){
  const res=await fetch(SUPABASE_URL+'/functions/v1/shiftboard-director-manual',{method:'POST',headers:await authHeaders(),body:JSON.stringify(body),cache:'no-store'});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Unable to process the report.');return data;
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest&&event.target.closest('[data-director-email="check"]');
  if(!button||busy||!allowed())return;
  event.preventDefault();busy=true;message='Checking the latest report…';render();
  try{
   loaded=await api({action:'status'});
   if(!allowed())return;
   const label=dateLabel(loaded.report_date);
   if(loaded.last_send){message=loaded.last_send.status==='submitted'?'The '+label+' report version has already been submitted using this button.':'A send of this version is in progress or needs an inbox check. It has not been sent again.';return;}
   const sites=loaded.reporting_sites+' of '+loaded.total_sites+' centres reporting';
   const yes=window.confirm('Send director email to Tony?\n\nReport date: '+label+'\n'+sites+'\nFrom: shiftboard@neautoservices.com\nTo: tony@neautoservices.com ONLY\n\nUses the latest saved Autowork snapshot, not a new import. The email is marked TEST.\n\nSend now?');
   if(!yes){message='Cancelled — no email sent.';return;}
   if(!allowed())return;
   message='Sending the '+label+' report to Tony…';render();
   const result=await api({action:'send',snapshot_id:loaded.snapshot_id,confirmed:true});
   message=result.message+' Report date: '+label+'.';
  }catch(error){message=error.message||'Unable to confirm delivery. Check your inbox before retrying.';}
  finally{busy=false;if(allowed())render();}
 });
})();
