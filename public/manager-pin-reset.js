(function(){
  'use strict';

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function siteStaff(){
    const siteId=String(state.admin.scopeSite||'');
    return (state.config.employees||[])
      .filter(function(emp){ return emp && emp.active!==false && String(emp.siteId||'')===siteId; })
      .slice()
      .sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });
  }

  function renderManagerPinReset(){
    const siteId=String(state.admin.scopeSite||'');
    const staff=siteStaff();
    const rows=staff.map(function(emp){
      return '<tr>'+
        '<td><b>'+esc(emp.name)+'</b></td>'+
        '<td><span style="color:var(--muted-2);">Hidden</span></td>'+
        '<td style="text-align:right;"><button type="button" class="btn-sm" data-manager-reset-pin="'+esc(emp.id)+'" data-manager-reset-name="'+esc(emp.name)+'">Reset PIN</button></td>'+
      '</tr>';
    }).join('');

    return '<div><h2>PINs</h2>'+
      '<div class="head-sub">Staff PINs are protected. You can reset a PIN for staff at your own site without seeing their current PIN.</div>'+
      '<div class="card" style="margin-bottom:14px;">'+
        '<div style="font-size:12px;color:var(--muted);line-height:1.5;">Choose <b>Reset PIN</b>, enter a temporary 4-digit PIN twice, then give it to the employee. They will be required to choose their own new PIN the next time they use it.</div>'+
      '</div>'+
      '<div class="card">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">'+
          '<h3 style="font-size:18px;">'+esc(typeof siteName==='function'?siteName(siteId):siteId)+'</h3>'+
          '<span style="font-size:12px;color:var(--muted);">'+staff.length+' active staff</span>'+
        '</div>'+
        '<table><thead><tr><th>Employee</th><th>Current PIN</th><th style="text-align:right;">Action</th></tr></thead><tbody>'+
          (rows||'<tr><td colspan="3" class="empty-state">No active employees at this site.</td></tr>')+
        '</tbody></table>'+
      '</div>'+
    '</div>';
  }

  async function resetPin(employeeId,employeeName,button){
    const first=window.prompt('Enter a temporary 4-digit PIN for '+employeeName+':');
    if(first===null) return;
    const pin=String(first).trim();
    if(!/^\d{4}$/.test(pin)){
      if(typeof showToast==='function') showToast('PIN must be exactly 4 digits.',true);
      return;
    }
    const second=window.prompt('Re-enter the temporary PIN for '+employeeName+':');
    if(second===null) return;
    if(String(second).trim()!==pin){
      if(typeof showToast==='function') showToast('The two PINs do not match.',true);
      return;
    }
    if(!window.confirm('Reset '+employeeName+'\'s PIN? Their old PIN will stop working immediately.')) return;

    if(button) button.disabled=true;
    try{
      const headers=await authHeaders();
      headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/manager_reset_staff_pin',{
        method:'POST',
        headers:headers,
        cache:'no-store',
        body:JSON.stringify({p_employee_id:employeeId,p_new_pin:pin})
      });
      let data={};
      try{ data=await res.json(); }catch(_e){}
      if(!res.ok) throw new Error(data.message||data.error||('request failed ('+res.status+')'));
      if(!data || data.ok!==true) throw new Error((data&&data.error)||'Could not reset PIN');
      if(typeof showToast==='function') showToast('PIN reset for '+employeeName+'. Give them temporary PIN '+pin+' — they will be asked to change it.');
    }catch(err){
      if(typeof showToast==='function') showToast('Could not reset PIN — '+(err&&err.message?err.message:'unknown error'),true);
    }finally{
      if(button) button.disabled=false;
    }
  }

  try{
    if(typeof renderAdmin==='function'){
      const previousRenderAdmin=renderAdmin;
      renderAdmin=function(){
        const html=previousRenderAdmin();
        if(!state.admin || state.admin.tab!=='pins' || state.admin.role!=='site') return html;
        const wrap=document.createElement('div');
        wrap.innerHTML=html;
        const main=wrap.querySelector('.admin-main');
        if(main){
          const top=main.querySelector('.admin-topbar');
          main.innerHTML=(top?top.outerHTML:'')+renderManagerPinReset();
        }
        return wrap.innerHTML;
      };
    }

    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest?e.target.closest('[data-manager-reset-pin]'):null;
      if(!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      resetPin(String(btn.getAttribute('data-manager-reset-pin')||''),String(btn.getAttribute('data-manager-reset-name')||'employee'),btn);
    },true);

    setTimeout(function(){
      try{ if(state&&state.admin&&state.admin.authed&&state.admin.tab==='pins'&&state.admin.role==='site'&&typeof render==='function') render(); }catch(_e){}
    },0);
  }catch(err){
    console.error('Manager PIN reset setup failed:',err);
  }
})();
