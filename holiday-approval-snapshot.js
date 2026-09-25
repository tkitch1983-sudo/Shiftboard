(function(){
  'use strict';

  try{
    if(typeof renderApproveModal!=='function') return;

    const originalRenderApproveModal=renderApproveModal;

    function esc(v){
      if(typeof salesHtml==='function') return salesHtml(v==null?'':String(v));
      return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function reqDate(v){
      try{ return typeof dateEntryDate==='function' ? dateEntryDate(v) : (typeof v==='string'?v:(v&&v.date)||''); }
      catch(_e){ return typeof v==='string'?v:(v&&v.date)||''; }
    }
    function amountLabel(v){
      const n=Number(v);
      if(!Number.isFinite(n)) return '';
      if(Math.abs(n-0.5)<0.001) return '½';
      if(Math.abs(n-1)<0.001) return '';
      return ' '+n.toFixed(2).replace(/\.00$/,'');
    }
    function dayLabel(ds){
      const d=new Date(ds+'T00:00:00');
      if(Number.isNaN(d.getTime())) return esc(ds);
      return esc(d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}));
    }
    function colour(siteId){
      try{ return typeof siteCalendarColour==='function' ? siteCalendarColour(siteId) : 'var(--amber)'; }
      catch(_e){ return 'var(--amber)'; }
    }

    function snapshotForRequest(r){
      if(!r) return '';
      const requester=typeof employeeById==='function' ? employeeById(r.employeeId) : null;
      const dates=[...new Set((Array.isArray(r.dates)?r.dates:[]).map(reqDate).filter(Boolean))].sort();
      if(!dates.length) return '';

      const configuredSites=((state&&state.config&&Array.isArray(state.config.sites))?state.config.sites:[])
        .filter(s=>s&&s.id&&s.name&&s.active!==false)
        .slice()
        .sort((a,b)=>String(a.name).localeCompare(String(b.name)));

      const cards=dates.map(ds=>{
        let entries=[];
        try{ entries=typeof approvedEmployeeEntriesForDate==='function' ? approvedEmployeeEntriesForDate(ds,r.id) : []; }
        catch(_e){ entries=[]; }
        const bySite=new Map();
        (Array.isArray(entries)?entries:[]).forEach(x=>{
          const e=typeof employeeById==='function'?employeeById(x.employeeId):null;
          if(!e) return;
          const key=e.siteId||'';
          if(!bySite.has(key)) bySite.set(key,[]);
          bySite.get(key).push({name:e.name,amount:x.amount,request:false});
        });
        if(requester){
          const key=requester.siteId||'';
          if(!bySite.has(key)) bySite.set(key,[]);
          bySite.get(key).push({name:requester.name,amount:1,request:true});
        }

        const approvedCount=(Array.isArray(entries)?entries:[]).length;
        const projected=approvedCount+(requester?1:0);
        const cap=state&&state.config&&state.config.settings?Number(state.config.settings.capOff):NaN;
        const over=Number.isFinite(cap)&&projected>cap;

        const siteRows=configuredSites.map(s=>{
          const people=bySite.get(s.id)||[];
          const chips=people.length ? people.map(p=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:14px;border:1px solid ${p.request?'var(--amber)':colour(s.id)};background:${p.request?'var(--amber-dim)':'var(--panel-2)'};font-size:11px;white-space:nowrap;color:var(--text);"><span style="width:6px;height:6px;border-radius:50%;background:${p.request?'var(--amber)':colour(s.id)};"></span>${esc(p.name)}${amountLabel(p.amount)}${p.request?' · REQUEST':''}</span>`).join(' ') : `<span style="font-size:11px;color:var(--muted-2);">—</span>`;
          return `<div style="display:grid;grid-template-columns:minmax(105px,34%) 1fr;gap:8px;align-items:start;padding:6px 0;border-top:1px solid var(--line-soft);"><div style="font-size:11px;font-weight:700;color:var(--muted);">${esc(s.name)}</div><div style="display:flex;gap:5px;flex-wrap:wrap;">${chips}</div></div>`;
        }).join('');

        return `<div style="border:1px solid ${over?'var(--red)':'var(--line)'};background:var(--panel);border-radius:4px;padding:10px 11px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:4px;">
            <b style="font-size:13px;">${dayLabel(ds)}</b>
            <span style="font-size:11px;color:${over?'var(--red)':'var(--muted)'};font-weight:${over?'800':'600'};">${projected}${Number.isFinite(cap)?' / '+cap:''} off${over?' · OVER CAP':''}</span>
          </div>
          ${siteRows}
        </div>`;
      }).join('');

      return `<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
        <div style="font-weight:800;font-size:14px;">All-sites holiday snapshot</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.4;">Existing approved holidays on each requested day across every site. The current request is highlighted.</div>
        <div style="max-height:42vh;overflow:auto;padding-right:2px;margin-top:7px;">${cards}</div>
      </div>`;
    }

    renderApproveModal=function(){
      const html=originalRenderApproveModal();
      if(!html || !state || !state.admin || !state.admin.pendingApprove) return html;
      const r=(Array.isArray(state.requests)?state.requests:[]).find(x=>x&&x.id===state.admin.pendingApprove);
      if(!r) return html;
      const snapshot=snapshotForRequest(r);
      if(!snapshot) return html;
      const marker='<div class="modal-actions">';
      if(!html.includes(marker)) return html;
      return html.replace(marker,snapshot+marker);
    };
  }catch(err){
    console.error('Holiday approval snapshot setup failed:',err);
  }
})();
