(function ytdComparisonEnhancement(){
  'use strict';
  if(typeof renderAdminSalesVs!=='function'||typeof state==='undefined')return;
  const originalRender=renderAdminSalesVs;
  const now=new Date();
  const prefs={site:'peterlee',yearA:String(now.getFullYear()-1),yearB:String(now.getFullYear()),endMonth:Math.max(1,now.getMonth())};
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const money=n=>Number.isFinite(n)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'—';
  const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hasAmount=r=>r&&r.total_net!==null&&r.total_net!==undefined&&r.total_net!==''&&Number.isFinite(Number(r.total_net));
  const finalDay=(year,month)=>String(year)+'-'+String(month).padStart(2,'0')+'-'+String(new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate()).padStart(2,'0');
  const isComplete=(r,year,month)=>!!r&&hasAmount(r)&&(!r.as_of||String(r.as_of).slice(0,10)>=finalDay(year,month));
  const signMoney=n=>n===0?money(0):(n>0?'+':'−')+money(Math.abs(n));
  const signPercent=n=>(n>0?'+':'')+n.toFixed(1)+'%';

  function buildData(){
    const all=(state.admin&&Array.isArray(state.admin.analysisRows))?state.admin.analysisRows:[];
    const years=[...new Set(all.map(r=>String(r.month_start||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort();
    const siteMap=new Map();
    all.forEach(r=>{
      const key=String(r.site_key||'');
      if(key&&!siteMap.has(key))siteMap.set(key,String(r.site_name||key));
    });
    const sites=[...siteMap].sort((a,b)=>a[1].localeCompare(b[1]));
    if(!siteMap.has(prefs.site))prefs.site=sites[0]?.[0]||'';
    if(!years.includes(prefs.yearB))prefs.yearB=years[years.length-1]||'';
    if(!years.includes(prefs.yearA)||prefs.yearA===prefs.yearB){
      prefs.yearA=years.includes(String(Number(prefs.yearB)-1))?String(Number(prefs.yearB)-1):(years.find(y=>y!==prefs.yearB)||'');
    }
    const endMonth=Math.min(12,Math.max(1,Number(prefs.endMonth)||10));
    const relevant=all.filter(r=>String(r.site_key)===prefs.site);
    const map=new Map(relevant.map(r=>[String(r.month_start||'').slice(0,7),r]));
    const info=(year,month)=>{
      const row=map.get(year+'-'+String(month).padStart(2,'0'))||null;
      return {row,amount:hasAmount(row)?Math.round(Number(row.total_net)*100)/100:null,complete:isComplete(row,year,month)};
    };
    const months=Array.from({length:endMonth},(_,i)=>{
      const month=i+1;
      return {month,a:info(prefs.yearA,month),b:info(prefs.yearB,month)};
    });
    const countA=months.filter(m=>m.a.complete).length, countB=months.filter(m=>m.b.complete).length;
    const totalCents=key=>months.reduce((n,m)=>n+(m[key].amount===null?0:Math.round(m[key].amount*100)),0);
    const totalA=totalCents('a')/100,totalB=totalCents('b')/100;
    const comparable=countA===endMonth&&countB===endMonth&&prefs.yearA!==prefs.yearB;
    const diff=Math.round((totalB-totalA)*100)/100;
    return {sites,years,months,endMonth,countA,countB,totalA,totalB,comparable,diff,pct:comparable&&totalA!==0?100*diff/Math.abs(totalA):null,siteName:siteMap.get(prefs.site)||prefs.site};
  }

  function makePanel(){
    const d=buildData();
    if(!d.years.length)return '';
    const siteOptions=d.sites.map(([key,name])=>`<option value="${escapeHtml(key)}" ${key===prefs.site?'selected':''}>${escapeHtml(name)}</option>`).join('');
    const yearOptions=selected=>d.years.map(y=>`<option value="${y}" ${y===selected?'selected':''}>${y}</option>`).join('');
    const monthOptions=monthNames.map((m,i)=>`<option value="${i+1}" ${i+1===d.endMonth?'selected':''}>${escapeHtml(m)}</option>`).join('');
    const body=d.months.map(m=>{
      const a=m.a.amount===null?'—':money(m.a.amount)+(m.a.complete?'':' *');
      const b=m.b.amount===null?'—':money(m.b.amount)+(m.b.complete?'':' *');
      const valid=m.a.complete&&m.b.complete;
      const diff=valid?Math.round((m.b.amount-m.a.amount)*100)/100:null;
      const pct=valid&&m.a.amount!==0?100*diff/Math.abs(m.a.amount):null;
      return `<tr><td style="font-weight:700;white-space:nowrap;">${monthNames[m.month-1]}</td><td class="mono" style="text-align:right;">${a}</td><td class="mono" style="text-align:right;">${b}</td><td class="mono" style="text-align:right;font-weight:700;">${diff===null?'—':signMoney(diff)}</td><td class="mono" style="text-align:right;">${pct===null?'—':signPercent(pct)}</td></tr>`;
    }).join('');
    const stat=(label,value)=>`<div class="card" style="margin:0;min-width:0;"><div style="font-size:11px;color:var(--muted);">${escapeHtml(label)}</div><div class="mono" style="font-size:clamp(16px,2.4vw,23px);font-weight:800;margin-top:6px;overflow-wrap:anywhere;">${value}</div></div>`;
    const warn=d.comparable?'':`<div style="font-size:12px;color:var(--muted);margin:12px 0;">Incomplete comparison: ${prefs.yearA} has ${d.countA}/${d.endMonth} complete months; ${prefs.yearB} has ${d.countB}/${d.endMonth}. Missing months are not counted as £0, and the YTD change is withheld until both periods are complete. An asterisk marks a partial month.</div>`;
    return `<section id="sales-ytd-comparison" class="card" style="margin-top:16px;border-left:4px solid var(--red);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div><div style="font-family:Oswald,sans-serif;font-size:20px;font-weight:600;">Year-to-date sales comparison</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">Same months in both years · recorded NET sales, not forecasts</div></div><button type="button" class="add-btn no-print" data-ytd-export="1">Download CSV</button></div>
      <div class="no-print" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:14px;">
        <label style="font-size:11px;color:var(--muted);">Garage<select id="ytd-compare-site" style="display:block;width:100%;margin-top:5px;padding:9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);">${siteOptions}</select></label>
        <label style="font-size:11px;color:var(--muted);">First year<select id="ytd-compare-year-a" style="display:block;width:100%;margin-top:5px;padding:9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);">${yearOptions(prefs.yearA)}</select></label>
        <label style="font-size:11px;color:var(--muted);">Second year<select id="ytd-compare-year-b" style="display:block;width:100%;margin-top:5px;padding:9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);">${yearOptions(prefs.yearB)}</select></label>
        <label style="font-size:11px;color:var(--muted);">Compare January through<select id="ytd-compare-end-month" style="display:block;width:100%;margin-top:5px;padding:9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);">${monthOptions}</select></label>
      </div>
      <div style="font-size:13px;margin:16px 0 10px;font-weight:700;">${escapeHtml(d.siteName)} · January–${monthNames[d.endMonth-1]} ${escapeHtml(prefs.yearA)} versus ${escapeHtml(prefs.yearB)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;">
        ${stat(prefs.yearA+' NET sales',money(d.totalA)+(d.countA!==d.endMonth?' (incomplete)':''))}
        ${stat(prefs.yearB+' NET sales',money(d.totalB)+(d.countB!==d.endMonth?' (incomplete)':''))}
        ${stat('Difference',d.comparable?signMoney(d.diff):'—')}
        ${stat('Year-on-year',d.pct===null?'—':signPercent(d.pct))}
      </div>
      ${warn}
      <div style="overflow-x:auto;margin-top:14px;"><table style="min-width:640px;margin:0;"><thead><tr><th>Month</th><th style="text-align:right;">${escapeHtml(prefs.yearA)}</th><th style="text-align:right;">${escapeHtml(prefs.yearB)}</th><th style="text-align:right;">Difference</th><th style="text-align:right;">Change %</th></tr></thead><tbody>${body}<tr style="font-weight:800;background:var(--panel-2);"><td>January–${monthNames[d.endMonth-1]} total</td><td class="mono" style="text-align:right;">${money(d.totalA)}</td><td class="mono" style="text-align:right;">${money(d.totalB)}</td><td class="mono" style="text-align:right;">${d.comparable?signMoney(d.diff):'—'}</td><td class="mono" style="text-align:right;">${d.pct===null?'—':signPercent(d.pct)}</td></tr></tbody></table></div>
    </section>`;
  }

  renderAdminSalesVs=function(){
    const original=originalRender();
    if(!state.admin||!Array.isArray(state.admin.analysisRows)||typeof canViewPrivateTab!=='function'||!canViewPrivateTab('salesvs'))return original;
    const anchor='<div class="card no-print"';
    const idx=original.indexOf(anchor);
    if(idx<0)return original;
    const html=original.slice(0,idx)+makePanel()+original.slice(idx);
    return html.replace('Compare months or full years from 2021 onwards.','Compare same-period year-to-date sales, months or full years from 2021 onwards.');
  };
  document.addEventListener('change',e=>{
    const el=e.target;if(!el||!el.id)return;
    if(el.id==='ytd-compare-site')prefs.site=el.value;
    else if(el.id==='ytd-compare-year-a')prefs.yearA=el.value;
    else if(el.id==='ytd-compare-year-b')prefs.yearB=el.value;
    else if(el.id==='ytd-compare-end-month')prefs.endMonth=Number(el.value);
    else return;
    if(typeof render==='function')render();
  });
  document.addEventListener('click',e=>{
    const btn=e.target&&e.target.closest?e.target.closest('[data-ytd-export]'):null;
    if(!btn)return;
    e.preventDefault();
    const d=buildData();
    const csvCell=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const head=['Month',prefs.yearA+' NET sales',prefs.yearB+' NET sales','Difference','Change %'];
    const lines=d.months.map(m=>{
      const valid=m.a.complete&&m.b.complete, diff=valid?Math.round((m.b.amount-m.a.amount)*100)/100:null;
      return [monthNames[m.month-1],m.a.amount??'',m.b.amount??'',valid?diff:'',valid&&m.a.amount!==0?(100*diff/Math.abs(m.a.amount)).toFixed(2):''].map(csvCell).join(',');
    });
    lines.push(['January–'+monthNames[d.endMonth-1]+' total',d.totalA,d.totalB,d.comparable?d.diff:'',d.pct===null?'':d.pct.toFixed(2)].map(csvCell).join(','));
    const blob=new Blob(['\uFEFF'+[head.map(csvCell).join(','),...lines].join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='NEAS-YTD-'+prefs.site+'-'+prefs.yearA+'-vs-'+prefs.yearB+'-through-'+String(d.endMonth).padStart(2,'0')+'.csv';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
})();
