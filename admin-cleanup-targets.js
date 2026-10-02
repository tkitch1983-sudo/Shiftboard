(function(){
  'use strict';
  try{
    if(typeof renderAdminTargets!=='function'||typeof _render!=='function')return;
    var setupActive=false;
    var oldTargets=renderAdminTargets;
    var oldSetup=typeof targetSetupPanel==='function'?targetSetupPanel:null;
    var oldAction=onAction;
    var oldRender=_render;

    function esc(v){try{return salesHtml(String(v==null?'':v));}catch(_e){return String(v==null?'':v);}}
    function style(){
      if(document.getElementById('sb-clean-pages-style'))return;
      var s=document.createElement('style');s.id='sb-clean-pages-style';
      s.textContent='.page-info-details{margin:28px 0 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}.page-info-details summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;align-items:center;gap:10px;font-weight:700}.page-info-details summary::-webkit-details-marker{display:none}.page-info-details summary:before{content:"i";display:grid;place-items:center;width:22px;height:22px;border:1px solid var(--muted-2);border-radius:50%;font-size:12px;color:var(--muted)}.page-info-details summary:after{content:"⌄";margin-left:auto;color:var(--muted);font-size:18px}.page-info-details[open] summary:after{transform:rotate(180deg)}.page-info-body{padding:0 16px 16px;color:var(--muted);font-size:13px;line-height:1.5}.page-info-body.head-sub{margin:0}@media print{.page-info-details{display:none!important}}';
      document.head.appendChild(s);
    }
    function introToBottom(){
      if(state.view!=='admin')return;
      var main=document.querySelector('.admin-main');if(!main||main.querySelector(':scope > .page-info-details'))return;
      var intro=null,children=Array.from(main.children);
      for(var i=0;i<children.length;i++){
        if(children[i].classList&&children[i].classList.contains('head-sub')){intro=children[i];break;}
        if(children[i].getAttribute&&children[i].getAttribute('data-tony-target-setup')==='1'){intro=children[i].querySelector('.head-sub');if(intro)break;}
      }
      if(!intro)return;
      var d=document.createElement('details');d.className='page-info-details no-print';
      var sum=document.createElement('summary');sum.textContent='Information';
      var body=document.createElement('div');body.className='page-info-body head-sub';body.innerHTML=intro.innerHTML;
      intro.remove();d.appendChild(sum);d.appendChild(body);main.appendChild(d);
    }
    function addSetupNav(){
      if(!isTonyLogin())return;
      var nav=document.querySelector('.admin-nav');if(!nav||nav.querySelector('[data-target-setup-nav]'))return;
      var targets=nav.querySelector('[data-admin-tab="targets"]');if(!targets)return;
      var item=document.createElement('div');item.className='nav-item'+(setupActive?' active':'');item.setAttribute('data-target-setup-nav','1');item.innerHTML='<span>Set Monthly Targets</span>';
      if(setupActive)Array.from(nav.querySelectorAll('.nav-item.active')).forEach(function(x){x.classList.remove('active');});
      targets.insertAdjacentElement('afterend',item);
      item.addEventListener('click',function(){setupActive=true;state.admin.tab='targets';render();});
    }
    function wireSetup(){
      var m=document.getElementById('target-setup-month');
      if(m)m.addEventListener('change',async function(){state.admin.targetMonth=m.value||new Date().toISOString().slice(0,7);await targetReloadLatest();render();},{once:true});
      document.querySelectorAll('[data-target-monthly],[data-target-saturday]').forEach(function(input){
        input.addEventListener('input',function(){
          var id=input.dataset.targetMonthly||input.dataset.targetSaturday,info=targetSiteInfo(id);if(!info)return;
          var monthly=document.querySelector('[data-target-monthly="'+id+'"]'),sat=document.querySelector('[data-target-saturday="'+id+'"]'),weekday=document.querySelector('[data-target-weekday="'+id+'"]');
          if(!weekday||weekday.dataset.manual==='1')return;
          var suggested=targetSuggestedWeekday(state.admin.targetMonth,info.site,info.key,Number(monthly&&monthly.value||0),Number(sat&&sat.value||0));weekday.value=String(suggested);
        });
      });
      document.querySelectorAll('[data-target-weekday]').forEach(function(input){input.addEventListener('input',function(){input.dataset.manual='1';});});
    }
    function mountSetup(){
      if(!setupActive||state.view!=='admin'||!isTonyLogin())return;
      var main=document.querySelector('.admin-main');if(!main)return;
      Array.from(main.children).forEach(function(x){if(!x.classList.contains('admin-topbar'))x.remove();});
      var month=state.admin.targetMonth||new Date().toISOString().slice(0,7),plan=targetMonthPlan(month),setup=oldSetup?oldSetup(month,plan):'';
      var host=document.createElement('div');host.setAttribute('data-tony-target-setup','1');
      host.innerHTML='<h2>Set Monthly Targets</h2><div class="head-sub">Tony-only setup for issuing the monthly workshop targets. Set each site monthly figure, Saturday figure and normal weekday value here. The main Targets tab stays clear for viewing sheets and entering daily actuals.</div><div class="cal-toolbar no-print"><label>Month <input id="target-setup-month" type="month" value="'+esc(month)+'"></label><button type="button" data-action="target-open-sheets">View target sheets</button></div>'+setup;
      main.appendChild(host);wireSetup();
    }

    renderAdminTargets=function(){
      var isSuper=state.admin.role==='super',month=state.admin.targetMonth||new Date().toISOString().slice(0,7),plan=targetMonthPlan(month),sites=targetWorkshopSites();
      var allowed=sites.some(function(x){return isSuper||String(x.site.id)===String(state.admin.scopeSite);});
      if(!allowed)return '<h2>Monthly Targets</h2><div class="card">No workshop target sheet is assigned to this account.</div>';
      var selected=isSuper?(state.admin.targetSite||'all'):String(state.admin.scopeSite);
      if(selected!=='all'&&!sites.some(function(x){return String(x.site.id)===String(selected);}))selected=isSuper?'all':String(state.admin.scopeSite);
      if(!plan)return '<h2>Monthly Targets</h2><div class="head-sub">This month target sheet has not been issued yet. Once Tony sets the monthly figures, the site sheets will appear here automatically.</div><div class="cal-toolbar no-print"><label>Month <input id="target-month" type="month" value="'+esc(month)+'"></label>'+(isTonyLogin()?'<button type="button" data-action="target-open-setup">Set monthly targets</button>':'')+'</div><div class="card">No target sheet is available for '+esc(targetMonthLabel(month))+'.</div>';
      var options='<option value="all" '+(selected==='all'?'selected':'')+'>Group</option>'+sites.map(function(x){return '<option value="'+esc(x.site.id)+'" '+(String(selected)===String(x.site.id)?'selected':'')+'>'+esc(TARGET_SITE_DEFAULTS[x.key].label)+'</option>';}).join('');
      var visible=selected==='all'?null:plan.sites&&plan.sites[selected];
      var output=selected==='all'?targetGroupSheet(plan):(visible?targetSiteSheet(Object.assign({month:month},visible),isSuper):'<div class="empty-state">This site has no target sheet for the selected month.</div>');
      var buttons=selected==='all'?'<button type="button" class="add-btn secondary" data-action="target-group-print">Print group</button><button type="button" class="add-btn secondary" data-action="target-group-download">Download group</button>':'<button type="button" class="add-btn secondary" data-action="target-site-print" data-site="'+esc(selected)+'">Print site</button><button type="button" class="add-btn secondary" data-action="target-site-download" data-site="'+esc(selected)+'">Download site</button>';
      if(isTonyLogin())buttons='<button type="button" class="add-btn" data-action="target-save">Save target changes</button>'+buttons+'<button type="button" class="add-btn secondary" data-action="target-open-setup">Set monthly targets</button>';
      return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div><h2 style="margin-bottom:4px;">Monthly Targets</h2></div><div class="no-print" style="display:flex;gap:7px;flex-wrap:wrap;">'+buttons+'</div></div><div class="head-sub">Daily Actual figures auto-save as they are entered. Monthly setup has been moved to Tony separate Set Monthly Targets tab.</div><div class="cal-toolbar no-print" style="margin-top:14px;"><label>Month <input id="target-month" type="month" value="'+esc(month)+'"></label>'+(isSuper?'<label>View <select id="target-site-filter">'+options+'</select></label>':'')+'<span style="margin-left:auto;font-size:11px;color:var(--muted);">Updated '+(plan.updatedAt?fmtTime(plan.updatedAt):'—')+'</span></div><div id="target-sheet-output">'+output+'</div>';
    };

    onAction=async function(e){
      var a=e&&e.currentTarget&&e.currentTarget.dataset?e.currentTarget.dataset.action:'';
      if(a==='target-open-setup'){if(!isTonyLogin()){showToast('Only Tony can set the monthly targets.',true);return;}setupActive=true;state.admin.tab='targets';render();return;}
      if(a==='target-open-sheets'){setupActive=false;state.admin.tab='targets';render();return;}
      if(a==='target-generate'&&!isTonyLogin()){showToast('Only Tony can set the monthly targets.',true);return;}
      return oldAction(e);
    };

    document.addEventListener('click',function(e){var n=e.target&&e.target.closest?e.target.closest('[data-admin-tab]'):null;if(n)setupActive=false;},true);
    style();
    _render=function(){var r=oldRender.apply(this,arguments);try{addSetupNav();mountSetup();introToBottom();}catch(err){console.error('Shiftboard page cleanup failed:',err);}return r;};
    if(state&&state.view==='admin')setTimeout(function(){try{render();}catch(_e){}},0);
  }catch(err){console.error('Shiftboard page cleanup patch failed:',err);}
})();