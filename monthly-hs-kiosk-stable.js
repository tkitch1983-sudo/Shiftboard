(function(){
  'use strict';

  const OVERLAY_ID='monthly-hs-kiosk-stable';
  const CHECKS=[
    ['grinder','Grinder'],
    ['oxy_acetylene','Oxy Acetylene'],
    ['tyre_machine','Tyre Machine'],
    ['ramps','Ramps'],
    ['brake_rollers','Brake Rollers'],
    ['jacks','Jacks'],
    ['wheel_balancers','Wheel Balancers'],
    ['windy_tools','Windy Tools'],
    ['mig_welder','MIG Welder'],
    ['gas_analyser','Gas Analyser'],
    ['manual_handling','Manual Handling'],
    ['racking_stacking','Racking & Stacking'],
    ['step_ladders','Step Ladders'],
    ['housekeeping','Housekeeping'],
    ['ppe','P.P.E.'],
    ['coshh','COSHH'],
    ['mot_qc','MOT QC']
  ];

  let pin='';
  let verifiedPin='';
  let record=null;
  let busy=false;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function monthLabel(v){
    const m=String(v||'').slice(0,7);
    if(!m)return '';
    const d=new Date(m+'-01T12:00:00');
    return Number.isNaN(d.getTime())?m:d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  }
  function dateTime(v){
    if(!v)return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function statusText(v){
    return v==='ok'?'OK':v==='issue'?'ISSUE':v==='na'?'N/A':'NOT SET';
  }
  function statusColour(v){
    return v==='ok'?'var(--green)':v==='issue'?'var(--red)':v==='na'?'var(--muted)':'var(--amber)';
  }
  function siteId(){
    try{return typeof getKioskSite==='function'?String(getKioskSite()||''):'';}catch(_e){return '';}
  }
  function auth(){
    if(typeof authHeaders!=='function')throw new Error('Shiftboard is not ready. Please refresh and try again.');
    return authHeaders();
  }
  function overlay(){
    return document.getElementById(OVERLAY_ID);
  }
  function removeOverlay(){
    const el=overlay();
    if(el)el.remove();
    pin='';verifiedPin='';record=null;busy=false;
  }
  function shell(inner){
    removeOverlay();
    const el=document.createElement('div');
    el.id=OVERLAY_ID;
    el.style.cssText='position:fixed;inset:0;z-index:2147483000;background:var(--bg,#0b0b0c);color:var(--text,#f7f7f8);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y;';
    el.innerHTML='<div style="min-height:100%;padding:20px 14px 40px;"><div style="width:min(680px,96vw);margin:0 auto;">'+inner+'</div></div>';
    document.body.appendChild(el);
    return el;
  }
  function titleBlock(sub){
    return '<div style="text-align:center;margin:10px 0 20px;"><h2 style="font-size:26px;margin:0 0 6px;font-family:Oswald,Arial,sans-serif;">Monthly H&amp;S</h2><div style="color:var(--muted);font-size:13px;line-height:1.45;">'+esc(sub||'')+'</div></div>';
  }
  function button(label,attrs,secondary){
    return '<button type="button" '+attrs+' style="width:100%;padding:15px 16px;margin-top:12px;border-radius:4px;border:1px solid '+(secondary?'var(--line)':'var(--amber)')+';background:'+(secondary?'var(--panel)':'var(--amber)')+';color:var(--text);font:600 16px Inter,Arial,sans-serif;cursor:pointer;touch-action:manipulation;">'+label+'</button>';
  }
  function bindCancel(root){
    const btn=root.querySelector('[data-mhk-cancel]');
    if(btn)btn.addEventListener('click',function(e){e.preventDefault();removeOverlay();});
  }

  function renderPin(){
    pin='';verifiedPin='';record=null;busy=false;
    const keys=['1','2','3','4','5','6','7','8','9','clear','0','back'];
    const keyHtml=keys.map(function(k){
      const label=k==='clear'?'Clear':k==='back'?'⌫':k;
      return '<button type="button" data-mhk-key="'+k+'" style="height:62px;border:1px solid var(--line);border-radius:4px;background:var(--panel-2);color:var(--text);font-size:'+(k==='clear'?'13':'22')+'px;cursor:pointer;touch-action:manipulation;">'+label+'</button>';
    }).join('');
    const root=shell(
      titleBlock('Enter your PIN to review this month’s checks')
      +'<div data-mhk-dots style="display:flex;justify-content:center;gap:12px;margin:18px 0 24px;">'
      +[0,1,2,3].map(function(){return '<span style="width:16px;height:16px;border:2px solid var(--line);border-radius:50%;display:block;"></span>';}).join('')
      +'</div>'
      +'<div style="width:min(300px,84vw);margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:11px;">'+keyHtml+'</div>'
      +'<div data-mhk-error style="min-height:22px;color:var(--red);font-size:13px;text-align:center;margin-top:14px;"></div>'
      +button('Cancel','data-mhk-cancel','1')
    );
    bindCancel(root);
    root.querySelectorAll('[data-mhk-key]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault();
        if(busy)return;
        const k=btn.getAttribute('data-mhk-key');
        if(k==='clear')pin='';
        else if(k==='back')pin=pin.slice(0,-1);
        else if(/^\d$/.test(k)&&pin.length<4)pin+=k;
        refreshDots(root);
        if(pin.length===4)verifyPin(root);
      });
    });
  }
  function refreshDots(root){
    const wrap=root.querySelector('[data-mhk-dots]');
    if(wrap){
      Array.from(wrap.children).forEach(function(dot,i){
        dot.style.background=i<pin.length?'var(--amber)':'transparent';
        dot.style.borderColor=i<pin.length?'var(--amber)':'var(--line)';
      });
    }
    const err=root.querySelector('[data-mhk-error]');
    if(err)err.textContent='';
  }
  async function verifyPin(root){
    if(busy||pin.length!==4)return;
    const sid=siteId();
    if(!sid){
      const err=root.querySelector('[data-mhk-error]');if(err)err.textContent='This device is not assigned to a site.';
      pin='';refreshDots(root);return;
    }
    busy=true;
    const err=root.querySelector('[data-mhk-error]');
    if(err){err.style.color='var(--muted)';err.textContent='Checking PIN…';}
    try{
      const headers=await auth();headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/monthly_hs_for_pin',{
        method:'POST',headers:headers,body:JSON.stringify({p_site_id:sid,p_pin:pin})
      });
      if(!res.ok)throw new Error('Could not verify PIN.');
      const data=await res.json();
      if(!data||!data.ok)throw new Error((data&&data.message)||'PIN not recognised.');
      verifiedPin=pin;
      record=data;
      renderReview();
    }catch(ex){
      pin='';
      busy=false;
      refreshDots(root);
      if(err){err.style.color='var(--red)';err.textContent=ex&&ex.message?ex.message:'Could not verify PIN.';}
    }
  }

  function reviewRows(){
    const values=(record&&record.checks)||{};
    return CHECKS.map(function(item){
      const row=values[item[0]]||{};
      const st=String(row.status||'');
      return '<div style="padding:13px 0;border-bottom:1px solid var(--line-soft);">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;"><b>'+esc(item[1])+'</b><b style="white-space:nowrap;color:'+statusColour(st)+';">'+esc(statusText(st))+'</b></div>'
        +(row.note?'<div style="margin-top:5px;color:var(--muted);font-size:12px;line-height:1.45;white-space:pre-wrap;">'+esc(row.note)+'</div>':'')
        +'</div>';
    }).join('');
  }
  function renderReview(){
    busy=false;
    const r=record||{};
    const already=!!r.acked;
    const root=shell(
      titleBlock((r.employee_name||'')+' · '+monthLabel(r.month_start)+' · Review every check below')
      +'<div style="border:1px solid var(--line);background:var(--panel);border-radius:4px;padding:4px 14px;">'+reviewRows()
      +(r.manager_notes?'<div style="margin:14px 0;padding:12px;border-left:4px solid var(--amber);background:var(--panel-2);"><b>Manager notes / actions</b><div style="margin-top:5px;color:var(--muted);font-size:12px;line-height:1.45;white-space:pre-wrap;">'+esc(r.manager_notes)+'</div></div>':'')
      +'</div>'
      +(already
        ?'<div style="margin-top:14px;padding:12px;border:1px solid var(--line);border-left:4px solid var(--green);background:var(--panel);"><b style="color:var(--green);">Already acknowledged</b><div style="margin-top:4px;color:var(--muted);font-size:12px;">Recorded '+esc(dateTime(r.acknowledged_at))+'.</div></div>'
        :'<div style="margin-top:14px;color:var(--muted);font-size:12px;line-height:1.5;">By acknowledging, you confirm that you have read and understood the monthly H&amp;S checks and notes above. Your PIN verifies who acknowledged it; the PIN itself is not stored in the acknowledgement record.</div>')
      +(already?button('Done','data-mhk-cancel',''):button('I have read and understood — acknowledge','data-mhk-ack',''))
      +button('Cancel','data-mhk-cancel','1')
      +'<div data-mhk-error style="min-height:22px;color:var(--red);font-size:13px;text-align:center;margin-top:10px;"></div>'
    );
    bindCancel(root);
    const ack=root.querySelector('[data-mhk-ack]');
    if(ack)ack.addEventListener('click',function(e){e.preventDefault();saveAck(root,ack);});
    try{root.scrollTop=0;}catch(_e){}
  }
  async function saveAck(root,btn){
    if(busy||!record||!record.check_id||!verifiedPin)return;
    busy=true;
    const old=btn.textContent;
    btn.disabled=true;btn.textContent='Saving acknowledgement…';
    const err=root.querySelector('[data-mhk-error]');
    if(err)err.textContent='';
    try{
      const headers=await auth();headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/monthly_hs_acknowledge',{
        method:'POST',headers:headers,body:JSON.stringify({p_check_id:record.check_id,p_pin:verifiedPin})
      });
      if(!res.ok)throw new Error('Could not save acknowledgement.');
      const data=await res.json();
      if(!data||!data.ok)throw new Error((data&&data.message)||'Could not save acknowledgement.');
      record.acked=true;
      record.acknowledged_at=data.acknowledged_at;
      const name=data.employee_name||record.employee_name||'';
      const done=shell(
        '<div style="text-align:center;padding-top:9vh;">'
        +'<div style="width:68px;height:68px;border-radius:50%;background:var(--green-dim);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:34px;margin:0 auto 18px;">✓</div>'
        +'<h2 style="font-size:27px;margin:0 0 8px;font-family:Oswald,Arial,sans-serif;">Monthly H&amp;S acknowledged</h2>'
        +'<div style="color:var(--muted);font-size:14px;line-height:1.5;">Thanks, '+esc(name)+'.<br>Recorded '+esc(dateTime(data.acknowledged_at))+'.</div>'
        +button('Done','data-mhk-cancel','')
        +'</div>'
      );
      bindCancel(done);
    }catch(ex){
      busy=false;btn.disabled=false;btn.textContent=old;
      if(err)err.textContent=ex&&ex.message?ex.message:'Could not save acknowledgement.';
    }
  }

  window.MonthlyHsKiosk={
    open:function(){renderPin();},
    close:function(){removeOverlay();}
  };
})();