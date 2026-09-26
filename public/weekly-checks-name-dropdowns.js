(function(){
  'use strict';

  const TAB_KEY='weeklychecks';
  const CLEAN_DAYS=['monday','tuesday','wednesday','thursday','friday','saturday'];
  const CLEAN_AREAS=['reception','office','toilets','mess'];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function sites(){return ((state.config&&state.config.sites)||[]).slice();}
  function siteFor(id){return sites().find(function(s){return String(s.id)===String(id);});}
  function employees(){return ((state.config&&state.config.employees)||[]).slice();}
  function activeEmployees(){
    return employees().filter(function(e){return e&&e.active!==false&&String(e.name||'').trim();}).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
  }
  function currentSiteId(){
    if(!state.admin)return '';
    return state.admin.role==='super'?String(state.admin.weeklySite||''):String(state.admin.scopeSite||'');
  }
  function addOption(parent,value,label,selected){
    const o=document.createElement('option');o.value=value;o.textContent=label;if(String(value)===String(selected||''))o.selected=true;parent.appendChild(o);
  }
  function staffSelect(input,siteId,allowSpecials){
    if(!input||input.tagName==='SELECT')return;
    const selected=String(input.value||'').trim();
    const active=activeEmployees();
    const same=active.filter(function(e){return String(e.siteId||'')===String(siteId||'');});
    const visiting=active.filter(function(e){return String(e.siteId||'')!==String(siteId||'');});
    const known=new Set(active.map(function(e){return String(e.name||'').trim();}));
    const special=new Set(['N/A','Closed']);
    const select=document.createElement('select');
    select.id=input.id;
    select.className=input.className||'';
    select.style.cssText=input.style.cssText||'';
    if(!select.style.minWidth)select.style.minWidth='145px';
    addOption(select,'','Select name',!selected);

    if(selected&&!known.has(selected)&&!special.has(selected)){
      const saved=document.createElement('optgroup');saved.label='Saved value';
      addOption(saved,selected,selected,selected);
      select.appendChild(saved);
    }

    const home=document.createElement('optgroup');home.label='This site';
    same.forEach(function(e){addOption(home,String(e.name||'').trim(),String(e.name||'').trim(),selected);});
    if(same.length)select.appendChild(home);

    if(allowSpecials){
      const status=document.createElement('optgroup');status.label='Not applicable';
      addOption(status,'N/A','N/A',selected);addOption(status,'Closed','Closed',selected);select.appendChild(status);
    }

    if(visiting.length){
      const other=document.createElement('optgroup');other.label='Visiting / other sites';
      visiting.forEach(function(e){
        const s=siteFor(e.siteId),name=String(e.name||'').trim();
        addOption(other,name,name+(s&&s.name?' — '+s.name:''),selected);
      });
      select.appendChild(other);
    }

    if(!same.length&&!visiting.length){
      const o=document.createElement('option');o.value='';o.textContent='No active staff found';o.disabled=true;select.appendChild(o);
    }
    input.replaceWith(select);
  }

  function patch(html){
    if(!state.admin||state.admin.tab!==TAB_KEY)return html;
    const wrap=document.createElement('div');wrap.innerHTML=html;
    const form=wrap.querySelector('#weekly-check-form');if(!form)return html;
    const siteId=String(form.dataset.siteId||currentSiteId()||'');

    staffSelect(form.querySelector('#wdf-car-by'),siteId,false);
    staffSelect(form.querySelector('#wdf-oxy-by'),siteId,false);
    CLEAN_DAYS.forEach(function(day){
      CLEAN_AREAS.forEach(function(area){staffSelect(form.querySelector('#wdf-clean-'+day+'-'+area),siteId,true);});
      staffSelect(form.querySelector('#wdf-clean-'+day+'-signature'),siteId,true);
    });

    const info=form.querySelector('[data-wdf-digital]');
    if(info&&!info.querySelector('[data-wdf-name-help]')){
      const box=document.createElement('div');box.setAttribute('data-wdf-name-help','');
      box.style.cssText='font-size:12px;color:var(--muted);margin:0 0 10px;';
      box.textContent='Name fields use active staff from the selected site. Active staff from other sites are available under Visiting / other sites.';
      const first=info.querySelector('.wdf-form');if(first)info.insertBefore(box,first);
    }
    return wrap.innerHTML;
  }

  try{
    if(typeof renderAdmin==='function'){
      const oldRender=renderAdmin;
      renderAdmin=function(){return patch(oldRender());};
    }
  }catch(e){console.error('Weekly name dropdown setup failed:',e);}
})();
