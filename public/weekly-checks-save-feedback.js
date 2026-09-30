(function(){
  'use strict';

  const TAB='weeklychecks';
  let refreshTimer=null;
  let lastKey='';

  function siteId(){
    try{
      if(!state||!state.admin)return '';
      return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
    }catch(_e){return '';}
  }

  function mondayIso(){
    const d=new Date(),diff=(d.getDay()+6)%7;
    d.setHours(12,0,0,0);d.setDate(d.getDate()-diff);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function weeklyOpen(){
    try{return !!(state&&state.admin&&state.admin.authed&&state.admin.tab===TAB&&document.getElementById('weekly-check-form'));}catch(_e){return false;}
  }

  function statusBadge(label,done){
    if(!label)return;
    let badge=label.querySelector('[data-wcf-saved]');
    if(done){
      label.style.background='var(--green-dim)';
      label.style.boxShadow='inset 4px 0 0 var(--green)';
      label.style.paddingLeft='12px';
      if(!badge){
        badge=document.createElement('span');
        badge.setAttribute('data-wcf-saved','1');
        badge.style.cssText='margin-left:auto;color:var(--green);font-size:12px;font-weight:800;white-space:nowrap;';
        badge.textContent='✓ SAVED';
        label.appendChild(badge);
      }
    }else{
      label.style.background='';
      label.style.boxShadow='';
      label.style.paddingLeft='';
      if(badge)badge.remove();
    }
  }

  function markCheckbox(id,done){
    const input=document.getElementById(id);if(!input)return;
    input.checked=!!done;
    input.style.accentColor='var(--green)';
    statusBadge(input.closest('label'),!!done);
  }

  function markButton(button,done){
    if(!button)return;
    if(done){
      button.style.borderColor='var(--green)';
      button.style.background='var(--green-dim)';
      button.style.color='var(--green)';
      button.style.fontWeight='800';
      if(!button.dataset.wcfOriginalText)button.dataset.wcfOriginalText=button.textContent.replace(/^✓\s*/,'');
      if(button.textContent.indexOf('Saving')<0&&!button.textContent.startsWith('✓'))button.textContent='✓ '+button.textContent;
    }else{
      button.style.borderColor='';button.style.background='';button.style.color='';button.style.fontWeight='';
      if(button.dataset.wcfOriginalText&&button.textContent.indexOf('Saving')<0)button.textContent=button.dataset.wcfOriginalText;
    }
  }

  function completeDay(day){
    if(!day||typeof day!=='object')return false;
    return !!(day.reception&&day.office&&day.toilets&&day.mess&&day.signature);
  }

  function markStock(rec){
    const input=document.getElementById('wc-stock-files');if(!input)return;
    input.accept='.pdf,.jpg,.jpeg,.jfif,.jpe,image/jpeg,.png,image/png,.webp,image/webp,.csv,.xls,.xlsx';
    const box=input.parentElement;
    const done=!!(rec&&rec.stock_take_done)||!!(rec&&Array.isArray(rec.stock_files)&&rec.stock_files.length);
    if(!box)return;
    let badge=box.querySelector('[data-wcf-stock-saved]');
    if(done){
      box.style.background='var(--green-dim)';
      box.style.boxShadow='inset 4px 0 0 var(--green)';
      box.style.paddingLeft='12px';
      if(!badge){
        badge=document.createElement('div');badge.setAttribute('data-wcf-stock-saved','1');
        badge.style.cssText='color:var(--green);font-size:12px;font-weight:800;margin-top:8px;';
        badge.textContent='✓ STOCK SHEET SAVED';box.appendChild(badge);
      }
    }else{
      box.style.background='';box.style.boxShadow='';box.style.paddingLeft='';if(badge)badge.remove();
    }
  }

  function apply(rec){
    if(!weeklyOpen())return;
    markCheckbox('wc-timesheet',rec&&rec.weekly_timesheet_done);
    markCheckbox('wc-car',rec&&rec.car_cleaning_done);
    markCheckbox('wc-site',rec&&rec.site_cleaning_done);
    markCheckbox('wc-oxy',rec&&rec.oxy_acetylene_done);
    markStock(rec);

    document.querySelectorAll('[data-wdf-save-section]').forEach(function(btn){
      const kind=btn.getAttribute('data-wdf-save-section');
      let done=false;
      if(kind==='car')done=!!(rec&&rec.car_cleaning_done);
      if(kind==='cleaning')done=!!(rec&&rec.site_cleaning_done);
      if(kind==='oxy')done=!!(rec&&rec.oxy_acetylene_done);
      if(kind==='manager')done=!!(rec&&(rec.weekly_timesheet_done||rec.stock_take_done));
      markButton(btn,done);
    });

    const days=(rec&&rec.site_cleaning_form&&rec.site_cleaning_form.days)||{};
    document.querySelectorAll('[data-wdf-save-day]').forEach(function(btn){
      const day=btn.getAttribute('data-wdf-save-day');const done=completeDay(days&&days[day]);
      markButton(btn,done);
      const row=btn.closest('tr');if(row){row.style.background=done?'var(--green-dim)':'';row.style.boxShadow=done?'inset 4px 0 0 var(--green)':'';}
    });
  }

  async function refresh(force){
    if(!weeklyOpen())return;
    const sid=siteId();if(!sid)return;
    const key=sid+'|'+mondayIso();
    if(!force&&key===lastKey&&document.documentElement.dataset.wcfApplied==='1')return;
    try{
      const headers=await authHeaders();
      const url=SUPABASE_URL+'/rest/v1/weekly_site_checks?select=*&site_id=eq.'+encodeURIComponent(sid)+'&week_start=eq.'+encodeURIComponent(mondayIso())+'&limit=1';
      const res=await fetch(url,{headers:headers,cache:'no-store'});if(!res.ok)return;
      const rows=await res.json();apply(rows[0]||null);lastKey=key;document.documentElement.dataset.wcfApplied='1';
    }catch(_e){}
  }

  function schedule(force,delay){
    clearTimeout(refreshTimer);refreshTimer=setTimeout(function(){refresh(!!force);},delay==null?180:delay);
  }

  function ext(name){
    const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:'';
  }

  function normalizeJpegs(input){
    if(!input||!input.files||!input.files.length)return;
    if(typeof DataTransfer==='undefined'||typeof File==='undefined')return;
    const dt=new DataTransfer();let changed=false;
    Array.from(input.files).forEach(function(file){
      const e=ext(file.name),type=String(file.type||'').toLowerCase();
      const jpeg=type==='image/jpeg'||type==='image/jpg'||e==='jfif'||e==='jpe';
      if(jpeg&&e!=='jpg'&&e!=='jpeg'){
        const base=String(file.name||'photo').replace(/\.[^.]+$/,'')||'photo';
        dt.items.add(new File([file],base+'.jpg',{type:'image/jpeg',lastModified:file.lastModified}));changed=true;
      }else dt.items.add(file);
    });
    if(changed){
      try{input.files=dt.files;if(typeof showToast==='function')showToast('JPEG ready to upload.');}catch(_e){}
    }
  }

  document.addEventListener('change',function(event){
    const input=event.target&&event.target.id==='wc-stock-files'?event.target:null;
    if(!input)return;input.accept='.pdf,.jpg,.jpeg,.jfif,.jpe,image/jpeg,.png,image/png,.webp,image/webp,.csv,.xls,.xlsx';normalizeJpegs(input);
  },true);

  document.addEventListener('click',function(event){
    const btn=event.target&&event.target.closest?event.target.closest('[data-wdf-save-section],[data-wdf-save-day],[data-wdf-final-submit]'):null;
    if(!btn)return;
    document.documentElement.dataset.wcfApplied='0';
    schedule(true,900);setTimeout(function(){refresh(true);},2200);
  },true);

  const observer=new MutationObserver(function(){
    const input=document.getElementById('wc-stock-files');if(input)input.accept='.pdf,.jpg,.jpeg,.jfif,.jpe,image/jpeg,.png,image/png,.webp,image/webp,.csv,.xls,.xlsx';
    if(weeklyOpen()){document.documentElement.dataset.wcfApplied='0';schedule(true,220);}
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});

  window.addEventListener('focus',function(){schedule(true,100);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule(true,100);});
  setInterval(function(){if(weeklyOpen())refresh(true);},15000);
  schedule(true,300);
})();
