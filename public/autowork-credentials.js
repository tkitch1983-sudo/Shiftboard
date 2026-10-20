/* Tony-only Autowork login maintenance. No current secret is ever sent to the browser. */
(function(){
  'use strict';
  const sites=[
    ['chester-le-street','Chester-le-Street'],
    ['fairfield','Fairfield'],
    ['gateshead','Gateshead'],
    ['hartlepool','Hartlepool'],
    ['lido','Lido'],
    ['middlesbrough','Middlesbrough'],
    ['peterlee','Peterlee'],
    ['seaham','Seaham']
  ];
  let selected='hartlepool', rows=null,loading=false,busy=false,error='';
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function authorised(){return typeof window.isTonyLogin==='function'&&window.isTonyLogin();}
  function redraw(){if(typeof window.render==='function'&&window.state?.admin?.tab==='autoworkcreds')window.render();}
  async function call(action,extra={}){
    if(!authorised())throw Error('Tony login required');
    const response=await fetch(SUPABASE_URL+'/functions/v1/shiftboard-autowork-credentials',{
      method:'POST',headers:await authHeaders(),cache:'no-store',
      body:JSON.stringify({action,...extra})
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(json.error||'Credential service unavailable');
    return json;
  }
  async function refresh(){
    if(!authorised()||loading)return;
    loading=true;error='';
    try{const result=await call('status');rows=Array.isArray(result.sites)?result.sites:[];}
    catch(e){error=e.message||'Unable to load Autowork status';}
    finally{loading=false;redraw();}
  }
  function renderPanel(){
    if(!authorised())return '<h2>Autowork Logins</h2><div class="card">This page is private to Tony.</div>';
    if(rows===null&&!loading&&!error)Promise.resolve().then(refresh);
    const statusBySite=new Map((rows||[]).map(x=>[x.site_key,x]));
    const active=sites.find(s=>s[0]===selected)||sites[0];
    const options=sites.map(([id,name])=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(name)+'</option>').join('');
    const cards=sites.map(([id,name])=>{
      const s=statusBySite.get(id);
      const username=s?.username_configured===true, password=s?.password_configured===true;
      return '<div class="card" style="padding:12px;margin:0;border-left:3px solid '+(username&&password?'var(--green)':'var(--line)')+';">'
        +'<b>'+esc(name)+'</b>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:5px;">'
        +'Username: '+(username?'Updated in secure vault':'Existing secure setting')+'<br>'
        +'Password: '+(password?'Updated in secure vault':'Existing secure setting')
        +'</div></div>';
    }).join('');
    return '<h2>Autowork Logins</h2>'
      +'<div class="head-sub">Tony only · Manage the usernames and passwords used by the automated Autowork runs</div>'
      +'<div class="card" style="border-left:4px solid var(--amber);">'
      +'<b>Change one workshop at a time</b><p style="font-size:13px;color:var(--muted);line-height:1.6;">'
      +'Enter a replacement username, password or both. Leave a field blank to keep its current setting. Saved details are encrypted and never displayed again. '
      +'The nightly sales and daytime jobs imports pick up the changes on their next run.</p>'
      +'<div class="field"><label for="autowork-site-key">Workshop</label><select id="autowork-site-key">'+options+'</select></div>'
      +'<div class="form-row" style="margin-top:12px;">'
      +'<div class="field"><label for="autowork-new-username">New Autowork username (optional)</label>'
      +'<input id="autowork-new-username" type="text" autocomplete="off" maxlength="255" placeholder="Leave blank to keep current username"></div>'
      +'<div class="field"><label for="autowork-new-password">New Autowork password (optional)</label>'
      +'<input id="autowork-new-password" type="password" autocomplete="new-password" maxlength="512" placeholder="Leave blank to keep current password"></div>'
      +'<div class="field"><label for="autowork-confirm-password">Confirm new password</label>'
      +'<input id="autowork-confirm-password" type="password" autocomplete="new-password" maxlength="512" placeholder="Re-enter new password if changing it"></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">'
      +'<button type="button" class="action-btn" data-autowork-action="save"'+(busy?' disabled':'')+'>Save '+esc(active[1])+' login details</button>'
      +'<button type="button" class="action-btn secondary" data-autowork-action="refresh">Refresh status</button></div>'
      +'<div id="autowork-result" role="status" style="margin-top:10px;font-size:13px;color:var(--muted);"></div>'
      +(error?'<p style="color:var(--red);" role="alert">'+esc(error)+'</p>':'')
      +'</div>'
      +'<h3>Workshop credential status</h3>'
      +(loading?'<div class="card">Loading secure status…</div>':'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:8px;">'+cards+'</div>')
      +'<p style="font-size:12px;color:var(--muted);margin-top:14px;">This page does not change your personal Shiftboard login. Changes do not update the Autowork website itself; change credentials in Autowork first, then enter them here.</p>';
  }
  document.addEventListener('change',e=>{
    if(e.target?.id==='autowork-site-key'){
      selected=String(e.target.value);
      redraw();
    }
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('[data-autowork-action]');
    if(!button||!authorised())return;
    const action=button.dataset.autoworkAction;
    if(action==='refresh'){await refresh();return;}
    if(action!=='save'||busy)return;
    const usernameInput=document.getElementById('autowork-new-username');
    const passwordInput=document.getElementById('autowork-new-password');
    const confirmInput=document.getElementById('autowork-confirm-password');
    const message=document.getElementById('autowork-result');
    if(!usernameInput||!passwordInput||!confirmInput||!message)return;
    const username=usernameInput.value;
    const password=passwordInput.value;
    if(!username&&!password){message.textContent='Enter a new username, password or both.';return;}
    if(password!==confirmInput.value){message.textContent='The passwords do not match.';return;}
    if(!window.confirm('Update the Autowork login details for '+(sites.find(s=>s[0]===selected)?.[1]||'this workshop')+'?'))return;
    busy=true;button.disabled=true;
    try{
      await call('save',{site_key:selected,username:username||null,password:password||null});
      // Clear secrets before any rerender; do not save in browser storage or logs.
      usernameInput.value='';passwordInput.value='';confirmInput.value='';
      if(typeof window.showToast==='function')window.showToast('Autowork login details securely updated.');
      rows=null;await refresh();
    }catch(err){
      message.textContent=err.message||'Save failed. Please try again.';
      message.style.color='var(--red)';
    }finally{busy=false;button.disabled=false;}
  });
  window.NEASAutoworkCredentials={render:renderPanel,refresh};
})();
