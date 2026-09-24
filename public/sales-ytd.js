(function(){
  'use strict';

  try{
    if(typeof renderAdminSales!=='function' || typeof authHeaders!=='function') return;

    const originalRenderAdminSales=renderAdminSales;
    let ytdRows=null;
    let ytdForDate='';
    let ytdLoading=false;
    let ytdError='';

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

    async function loadYtd(snapshotDate){
      if(!snapshotDate || ytdLoading) return;
      ytdLoading=true;
      ytdError='';
      try{
        const headers=await authHeaders();
        headers['Content-Type']='application/json';
        const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/sales_ytd_same_date',{
          method:'POST',headers,cache:'no-store',body:JSON.stringify({p_snapshot_date:snapshotDate})
        });
        if(!res.ok) throw new Error('YTD sales '+res.status);
        ytdRows=await res.json();
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
      }
      return html+ytdBlock(snap);
    };
  }catch(err){
    console.error('Live Sales YTD setup failed:',err);
  }
})();
