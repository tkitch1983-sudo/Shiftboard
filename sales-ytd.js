(function(){
  'use strict';

  try{
    if(typeof renderAdminSales!=='function' || typeof authHeaders!=='function') return;

    const originalRenderAdminSales=renderAdminSales;
    let salesPeriod='mtd';
    let ytdRows=null;
    let ytdForDate='';
    let ytdLoading=false;
    let ytdError='';
    let dailyRows=null;
    let dailyForDate='';
    let dailyLoading=false;
    let dailyError='';

    function esc(v){
      return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function money(v){
      if(v===null || v===undefined || v==='') return 'N/A';
      if(typeof salesMoney==='function') return salesMoney(v);
      const n=Number(v);
      return Number.isFinite(n)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n):'N/A';
    }
    function dateLabel(v){
      if(typeof salesDateLabel==='function') return salesDateLabel(v);
      const d=new Date(String(v)+'T00:00:00');
      return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    }
    function shortDate(v){
      const d=new Date(String(v)+'T00:00:00');
      return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}).toUpperCase();
    }

    async function rpcRows(fn,snapshotDate){
      const headers=await authHeaders();
      headers['Content-Type']='application/json';
      const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{
        method:'POST',headers,cache:'no-store',body:JSON.stringify({p_snapshot_date:snapshotDate})
      });
      if(!res.ok) throw new Error(fn+' '+res.status);
      return await res.json();
    }

    async function loadYtd(snapshotDate){
      if(!snapshotDate || ytdLoading) return;
      ytdLoading=true;
      ytdError='';
      try{
        ytdRows=await rpcRows('sales_ytd_same_date',snapshotDate);
        ytdForDate=snapshotDate;
      }catch(err){
        ytdRows=null;
        ytdForDate=snapshotDate;
        ytdError=err && err.message ? err.message : 'YTD comparison unavailable';
      }finally{
        ytdLoading=false;
        try{ if(state && state.admin && state.admin.tab==='sales' && typeof render==='function') render(); }catch(_e){}
      }
    }

    async function loadDaily(snapshotDate){
      if(!snapshotDate || dailyLoading) return;
      dailyLoading=true;
      dailyError='';
      try{
        dailyRows=await rpcRows('sales_daily_same_date',snapshotDate);
        dailyForDate=snapshotDate;
      }catch(err){
        dailyRows=null;
        dailyForDate=snapshotDate;
        dailyError=err && err.message ? err.message : 'Daily comparison unavailable';
      }finally{
        dailyLoading=false;
        try{ if(state && state.admin && state.admin.tab==='sales' && typeof render==='function') render(); }catch(_e){}
      }
    }

    function ytdBlock(snapshotDate){
      if(ytdForDate!==snapshotDate){
        if(!ytdLoading) setTimeout(()=>loadYtd(snapshotDate),0);
        return `<div class="card" style="margin-top:14px;"><b>Actual year-to-date</b><div style="color:var(--muted);font-size:12px;margin-top:5px;">Loading same-date YTD figures…</div></div>`;
      }
      if(ytdError){
        return `<div class="card" style="margin-top:14px;border-left:4px solid var(--red);"><b>Actual year-to-date</b><div style="color:var(--muted);font-size:12px;margin-top:5px;">${esc(ytdError)}</div></div>`;
      }
      if(!Array.isArray(ytdRows) || !ytdRows.length) return '';

      const first=ytdRows[0]||{};
      const currentYear=Number(first.current_year)||Number(String(snapshotDate).slice(0,4));
      const priorYear=Number(first.prior_year)||currentYear-1;
      const dayMonth=dateLabel(snapshotDate).replace(/\s+\d{4}$/,'');
      let groupCurrent=0, groupPrior=0, priorCount=0;
      const rows=ytdRows.map(r=>{
        const cur=Number(r.ytd_current);
        const prior=(r.ytd_prior===null||r.ytd_prior===undefined||r.ytd_prior==='')?null:Number(r.ytd_prior);
        if(Number.isFinite(cur)) groupCurrent+=cur;
        if(prior!==null && Number.isFinite(prior)){ groupPrior+=prior; priorCount++; }
        return `<tr><td style="font-weight:600;white-space:nowrap;">${esc(r.site_name)}</td><td class="mono">${money(r.ytd_current)}</td><td class="mono">${prior===null?'N/A':money(prior)}</td></tr>`;
      }).join('');
      const group=`<tr style="font-weight:800;background:var(--panel-2);"><td>NEAS Group</td><td class="mono">${money(groupCurrent)}</td><td class="mono">${priorCount?money(groupPrior):'N/A'}</td></tr>`;

      return `<div class="card" style="margin-top:14px;padding:0;overflow:auto;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line);">
          <div style="font-weight:800;font-size:17px;">Actual year-to-date — same date comparison</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">Through ${esc(dayMonth)} in both years. Completed months plus the current month to the same day.</div>
        </div>
        <table style="min-width:520px;margin:0;"><thead><tr><th>Site</th><th>YTD ${currentYear} to ${esc(dayMonth)}</th><th>YTD ${priorYear} to ${esc(dayMonth)}</th></tr></thead><tbody>${rows}${group}</tbody></table>
      </div>`;
    }

    function periodControls(snapshotDate){
      const daily=salesPeriod==='daily';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0 10px;">
        <div style="display:inline-flex;border:1px solid var(--line);border-radius:5px;overflow:hidden;">
          <button type="button" data-sales-period="mtd" style="border:0;border-right:1px solid var(--line);padding:9px 16px;cursor:pointer;background:${daily?'var(--panel)':'var(--amber)'};color:${daily?'var(--text)':'#fff'};font-weight:700;">MTD</button>
          <button type="button" data-sales-period="daily" style="border:0;padding:9px 16px;cursor:pointer;background:${daily?'var(--amber)':'var(--panel)'};color:${daily?'#fff':'var(--text)'};font-weight:700;">Daily</button>
        </div>
        <div style="font-size:12px;color:var(--muted);">${daily?'Sales on '+esc(dateLabel(snapshotDate)):'Month to date through '+esc(dateLabel(snapshotDate))}</div>
      </div>`;
    }

    function dailyTable(snapshotDate){
      const year=Number(String(snapshotDate).slice(0,4));
      const priorYear=year-1;
      if(dailyForDate!==snapshotDate){
        if(!dailyLoading) setTimeout(()=>loadDaily(snapshotDate),0);
        return `<div class="card" style="margin:0 0 12px;"><b>Daily sales</b><div style="color:var(--muted);font-size:12px;margin-top:5px;">Loading daily figures…</div></div>`;
      }
      if(dailyError){
        return `<div class="card" style="margin:0 0 12px;border-left:4px solid var(--red);"><b>Daily sales</b><div style="color:var(--muted);font-size:12px;margin-top:5px;">${esc(dailyError)}</div></div>`;
      }
      if(!Array.isArray(dailyRows)||!dailyRows.length) return '<div class="card">No daily figures available.</div>';

      let groupCurrent=0, groupPrior=0, currentCount=0, priorCount=0;
      const body=dailyRows.map(r=>{
        const cur=(r.daily_current===null||r.daily_current===undefined||r.daily_current==='')?null:Number(r.daily_current);
        const prior=(r.daily_prior===null||r.daily_prior===undefined||r.daily_prior==='')?null:Number(r.daily_prior);
        if(cur!==null && Number.isFinite(cur)){ groupCurrent+=cur; currentCount++; }
        if(prior!==null && Number.isFinite(prior)){ groupPrior+=prior; priorCount++; }
        return `<tr><td style="font-weight:600;white-space:nowrap;">${esc(r.site_name)}</td><td class="mono">${cur===null?'N/A':money(cur)}</td><td class="mono">${prior===null?'N/A':money(prior)}</td></tr>`;
      }).join('');
      const group=`<tr style="font-weight:800;background:var(--panel-2);"><td>NEAS Group</td><td class="mono">${currentCount?money(groupCurrent):'N/A'}</td><td class="mono">${priorCount?money(groupPrior):'N/A'}</td></tr>`;
      const d=shortDate(snapshotDate);
      return `<table style="min-width:520px;"><thead><tr><th>Site</th><th>Daily ${year} · ${esc(d)}</th><th>Daily ${priorYear} · ${esc(d)}</th></tr></thead><tbody>${body}${group}</tbody></table>`;
    }

    function replacePeriodTable(html,snapshotDate,year){
      const needle='MTD '+year;
      const pos=html.indexOf(needle);
      if(pos<0) return periodControls(snapshotDate)+html;
      const tableStart=html.lastIndexOf('<table',pos);
      const tableEndStart=html.indexOf('</table>',pos);
      if(tableStart<0 || tableEndStart<0) return periodControls(snapshotDate)+html;
      const tableEnd=tableEndStart+'</table>'.length;
      const selectedTable=salesPeriod==='daily' ? dailyTable(snapshotDate) : html.slice(tableStart,tableEnd);
      return html.slice(0,tableStart)+periodControls(snapshotDate)+selectedTable+html.slice(tableEnd);
    }

    renderAdminSales=function(){
      let html=originalRenderAdminSales();
      const rows=state && state.admin ? state.admin.salesRows : null;
      if(!Array.isArray(rows) || !rows.length) return html;
      const snap=String(rows[0].snapshot_date||'');
      if(!snap) return html;
      const year=Number(snap.slice(0,4));
      if(Number.isFinite(year)){
        html=html.split('Total '+year).join('MTD '+year);
        html=html.split('Total '+(year-1)).join('MTD '+(year-1));
        html=replacePeriodTable(html,snap,year);
      }
      return html+ytdBlock(snap);
    };

    document.addEventListener('click',function(e){
      const btn=e.target && e.target.closest ? e.target.closest('[data-sales-period]') : null;
      if(!btn) return;
      const next=btn.dataset.salesPeriod==='daily'?'daily':'mtd';
      if(next===salesPeriod) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      salesPeriod=next;
      const rows=state && state.admin ? state.admin.salesRows : null;
      const snap=Array.isArray(rows)&&rows[0] ? String(rows[0].snapshot_date||'') : '';
      if(next==='daily' && snap && dailyForDate!==snap && !dailyLoading) loadDaily(snap);
      if(typeof render==='function') render();
    },true);
  }catch(err){
    console.error('Live Sales YTD setup failed:',err);
  }
})();
