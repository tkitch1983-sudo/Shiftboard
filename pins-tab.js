(function(){
  'use strict';

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function allSites(){
    return (state.config.sites||[]).slice().sort(function(a,b){
      return String(a.name||'').localeCompare(String(b.name||''));
    });
  }

  function activeStaff(siteId){
    return (state.config.employees||[])
      .filter(function(emp){ return emp && emp.active!==false && String(emp.siteId)===String(siteId); })
      .slice()
      .sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });
  }

  function pinsSelectedSite(){
    if(state.admin.role!=='super') return String(state.admin.scopeSite||'');
    return String(state.admin.pinsSite||'all');
  }

  function staffTable(site){
    const staff=activeStaff(site.id);
    const rows=staff.map(function(emp){
      return '<tr><td><b>'+esc(emp.name)+'</b></td><td class="mono" style="font-size:18px;font-weight:700;letter-spacing:.12em;">'+esc(emp.pin||'—')+'</td></tr>';
    }).join('');
    return '<div class="card" style="margin-bottom:14px;">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">'
      +'<h3 style="font-size:18px;">'+esc(site.name)+'</h3><span style="font-size:12px;color:var(--muted);">'+staff.length+' active staff</span></div>'
      +'<table><thead><tr><th>Employee</th><th>PIN</th></tr></thead><tbody>'
      +(rows||'<tr><td colspan="2" class="empty-state">No active employees at this site.</td></tr>')
      +'</tbody></table></div>';
  }

  function renderPins(){
    const isSuper=state.admin.role==='super';
    const sites=allSites();
    let selected=pinsSelectedSite();
    if(selected!=='all' && !sites.some(function(s){ return String(s.id)===selected; })){
      selected=isSuper?'all':String(state.admin.scopeSite||'');
      state.admin.pinsSite=selected;
    }
    const shown=selected==='all' ? sites : sites.filter(function(s){ return String(s.id)===selected; });
    const options='<option value="all" '+(selected==='all'?'selected':'')+'>All sites</option>'
      +sites.map(function(s){ return '<option value="'+esc(s.id)+'" '+(String(s.id)===selected?'selected':'')+'>'+esc(s.name)+'</option>'; }).join('');

    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">'
      +'<div><h2>PINs</h2><div class="head-sub" style="margin-bottom:0;">Active employee clocking and holiday PINs, grouped by site.</div></div>'
      +'<button type="button" class="add-btn" data-pins-action="print">🖶 Print '+(selected==='all'?'all sites':'this site')+'</button></div>'
      +(isSuper?'<div class="cal-toolbar" style="margin-top:18px;"><label style="font-size:12px;color:var(--muted);">Site</label><select id="pins-site-select">'+options+'</select></div>':'')
      +'<div style="font-size:11px;color:var(--muted-2);margin:12px 0 14px;">PINs are sign-in credentials. Keep printed copies secure and destroy old copies when a PIN changes.</div>'
      +(shown.map(staffTable).join('')||'<div class="card"><div class="empty-state">No sites available.</div></div>');
  }

  function printableSheet(site){
    const staff=activeStaff(site.id);
    const rows=staff.map(function(emp){
      return '<tr><td>'+esc(emp.name)+'</td><td class="pin">'+esc(emp.pin||'—')+'</td></tr>';
    }).join('');
    return '<section class="sheet">'
      +'<header>'+(typeof LOGO_DATA_URI!=='undefined'?'<img src="'+LOGO_DATA_URI+'" alt="North East Auto Services">':'')
      +'<div><h1>STAFF PIN LIST</h1><h2>'+esc(site.name)+'</h2></div></header>'
      +'<table><thead><tr><th>Employee</th><th>PIN</th></tr></thead><tbody>'
      +(rows||'<tr><td colspan="2">No active employees.</td></tr>')
      +'</tbody></table>'
      +'<footer>Confidential — staff sign-in credentials · Printed '+esc(new Date().toLocaleDateString('en-GB'))+'</footer>'
      +'</section>';
  }

  function printPins(){
    const selected=pinsSelectedSite();
    const sites=allSites().filter(function(site){
      return selected==='all' || String(site.id)===selected;
    });
    if(!sites.length){
      if(typeof showToast==='function') showToast('No site is available to print.',true);
      return;
    }
    const win=window.open('','_blank','width=850,height=900');
    if(!win){
      if(typeof showToast==='function') showToast('Allow pop-ups to print the PIN list.',true);
      return;
    }
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Staff PIN List</title><style>'
      +'@page{size:A4 portrait;margin:14mm;}*{box-sizing:border-box;}body{margin:0;font-family:Arial,sans-serif;color:#111;background:#fff;}'
      +'.sheet{page-break-after:always;min-height:260mm;position:relative;padding-bottom:18mm}.sheet:last-child{page-break-after:auto;}'
      +'header{display:flex;align-items:center;gap:18px;border-bottom:3px solid #d71920;padding-bottom:12px;margin-bottom:18px;}header img{max-width:150px;max-height:58px;}h1{font-size:24px;margin:0 0 4px;}h2{font-size:18px;margin:0;font-weight:600;}'
      +'table{width:100%;border-collapse:collapse;font-size:15px;}th,td{border:1px solid #aaa;padding:10px 12px;text-align:left;}th{background:#eee;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.pin{font-family:monospace;font-size:20px;font-weight:700;letter-spacing:.14em;width:34%;}'
      +'footer{position:absolute;left:0;right:0;bottom:0;border-top:1px solid #bbb;padding-top:8px;font-size:10px;color:#555;}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}'
      +'</style></head><body>'+sites.map(printableSheet).join('')+'<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script></body></html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  try{
    if(typeof ADMIN_TAB_OPTIONS!=='undefined' && !ADMIN_TAB_OPTIONS.some(function(row){ return row[0]==='pins'; })){
      const at=ADMIN_TAB_OPTIONS.findIndex(function(row){ return row[0]==='payrates'; });
      ADMIN_TAB_OPTIONS.splice(at>=0?at:ADMIN_TAB_OPTIONS.length,0,['pins','PINs','Staff']);
    }
    if(typeof state!=='undefined' && state.admin && state.admin.pinsSite===undefined) state.admin.pinsSite='all';

    const originalRenderAdmin=renderAdmin;
    renderAdmin=function(){
      const html=originalRenderAdmin();
      if(!state.admin || state.admin.tab!=='pins') return html;
      const wrap=document.createElement('div');
      wrap.innerHTML=html;
      const main=wrap.querySelector('.admin-main');
      if(main){
        const top=main.querySelector('.admin-topbar');
        const topHtml=top?top.outerHTML:'';
        main.innerHTML=topHtml+renderPins();
      }
      return wrap.innerHTML;
    };
  }catch(err){
    console.error('PINs tab setup failed:',err);
  }

  document.addEventListener('change',function(e){
    if(!e.target || e.target.id!=='pins-site-select') return;
    state.admin.pinsSite=e.target.value||'all';
    if(typeof render==='function') render();
  },true);

  document.addEventListener('click',function(e){
    const btn=e.target&&e.target.closest?e.target.closest('[data-pins-action="print"]'):null;
    if(!btn) return;
    e.preventDefault();
    printPins();
  },true);

  setTimeout(function(){
    try{ if(typeof state!=='undefined' && state.admin && state.admin.authed && typeof render==='function') render(); }catch(_e){}
  },0);
})();
