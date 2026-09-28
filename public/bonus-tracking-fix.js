(function(){
  'use strict';

  function amount(v){
    const n=Number(v||0);
    return Number.isFinite(n)?n:0;
  }

  function correctedBonusAddOn(snapshot){
    if(!snapshot) return 0;
    const tracking=amount(snapshot.tracking);
    const trackingPay=tracking>=50 ? tracking*2 : tracking;
    return trackingPay+
      amount(snapshot.pollen)+
      amount(snapshot.bfc)+
      amount(snapshot.diag)+
      amount(snapshot.coolant)+
      amount(snapshot.ac);
  }

  // At 50 trackings the whole tracking rate becomes £2 each:
  // 49 = £49, 50 = £100, 51 = £102.
  try{ window.bonusAddOn=correctedBonusAddOn; }catch(_e){}
  try{ bonusAddOn=correctedBonusAddOn; }catch(_e){}

  // Reference scheme recovered from the bonus discussion. This is deliberately
  // comparison-only: it must not replace or save over the live Shiftboard rules.
  const REFERENCE_RULES={
    peterlee:      {label:'Peterlee',      staffStart:90000, staffBase:350, davantiTarget:150},
    middlesbrough: {label:'Middlesbrough', staffStart:90000, staffBase:350, davantiTarget:150},
    fairfield:     {label:'Fairfield',     staffStart:80000, staffBase:450, davantiTarget:100},
    chester:       {label:'Chester',       staffStart:70000, staffBase:350, davantiTarget:50},
    gateshead:     {label:'Gateshead',     staffStart:80000, staffBase:450, davantiTarget:75},
    seaham:        {label:'Seaham',        staffStart:70000, staffBase:350, davantiTarget:100},
    hartlepool:    {label:'Hartlepool',    staffStart:45000, staffBase:400, davantiTarget:50},
    lido:          {label:'Lido',          staffStart:null,  staffBase:0,   davantiTarget:100}
  };

  function tier(value,start,base){
    value=amount(value);
    return start!=null && value>=start ? amount(base)+(Math.floor((value-start)/5000)*50) : 0;
  }

  function davanti(units,target){
    units=amount(units);
    return target!=null && units>=target ? 50+Math.max(0,units-target)*2 : 0;
  }

  function money(v){
    try{ if(typeof bonusMoney==='function') return bonusMoney(v); }catch(_e){}
    const n=amount(v);
    return '£'+n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function signedMoney(v){
    const n=amount(v);
    if(Math.abs(n)<0.005) return '—';
    return (n>0?'+':'−')+money(Math.abs(n));
  }

  function currentRule(key){
    try{ return (typeof BONUS_SITE_RULES!=='undefined' && BONUS_SITE_RULES[key]) ? BONUS_SITE_RULES[key] : null; }
    catch(_e){ return null; }
  }

  function comparisonSnapshots(month){
    let snaps={};
    try{ if(typeof bonusSnapshotsForMonth==='function') snaps=bonusSnapshotsForMonth(month)||{}; }catch(_e){}
    try{
      const currentMonth=new Date().toISOString().slice(0,7);
      if(month===currentMonth && state && state.admin && state.admin.bonusPredictMode && typeof bonusProjectSnapshot==='function'){
        Object.keys(snaps).forEach(k=>{ snaps[k]=bonusProjectSnapshot(snaps[k],month); });
      }
    }catch(_e){}
    return snaps;
  }

  function tonyOnlyComparison(){
    try{ if(typeof isTonyLogin!=='function' || !isTonyLogin()) return ''; }catch(_e){ return ''; }
    let month=new Date().toISOString().slice(0,7);
    try{ month=(state&&state.admin&&state.admin.bonusMonth)||month; }catch(_e){}
    const snaps=comparisonSnapshots(month);
    let liveSum=0, refSum=0;

    const rows=Object.entries(REFERENCE_RULES).map(([key,ref])=>{
      const live=currentRule(key);
      const snap=snaps[key]||null;
      const sales=amount(snap&&snap.total_current);
      const units=amount(snap&&snap.davanti);
      const liveTurnover=live&&live.staffStart!=null ? tier(sales,live.staffStart,live.staffBase) : 0;
      const refTurnover=ref.staffStart!=null ? tier(sales,ref.staffStart,ref.staffBase) : 0;
      const liveDavanti=live&&live.davantiTarget!=null ? davanti(units,live.davantiTarget) : 0;
      const refDavanti=ref.davantiTarget!=null ? davanti(units,ref.davantiTarget) : 0;
      const addOn=correctedBonusAddOn(snap);
      liveSum+=liveTurnover;
      refSum+=refTurnover;
      const turnoverNote=ref.staffStart==null
        ? '<span style="color:var(--amber);font-size:10px;">Reference turnover not set</span>'
        : '<span style="color:var(--muted-2);font-size:10px;">Target '+money(ref.staffStart).replace('.00','')+' · starts '+money(ref.staffBase).replace('.00','')+'</span>';
      return '<tr>'+ 
        '<td><b>'+ref.label+'</b><div>'+turnoverNote+'</div></td>'+ 
        '<td>'+money(sales)+'</td>'+ 
        '<td>'+money(liveTurnover)+'</td>'+ 
        '<td>'+money(refTurnover)+'</td>'+ 
        '<td style="font-weight:700;">'+signedMoney(refTurnover-liveTurnover)+'</td>'+ 
        '<td>'+units+' / '+money(liveDavanti)+'</td>'+ 
        '<td>'+money(refDavanti)+'</td>'+ 
        '<td>'+money(addOn)+'</td>'+ 
      '</tr>';
    }).join('');

    let label=month;
    try{ label=new Date(month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }catch(_e){}
    const totalDiff=refSum-liveSum;

    return '<div id="bonus-tony-comparison" class="card" style="margin-top:16px;border-left:4px solid var(--amber);">'+
      '<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><div style="font-family:Oswald,sans-serif;font-size:19px;font-weight:700;">Tony-only bonus comparison</div>'+ 
        '<div style="font-size:12px;color:var(--muted);margin-top:4px;">'+label+' · read only · does not alter saved Bonus Sheet figures</div></div>'+ 
        '<div style="text-align:right;"><div style="font-size:10px;color:var(--muted-2);text-transform:uppercase;">Turnover base comparison</div>'+ 
        '<div style="font-size:18px;font-weight:800;">'+signedMoney(totalDiff)+'</div></div>'+ 
      '</div>'+ 
      '<div style="overflow-x:auto;margin-top:13px;"><table style="min-width:980px;font-size:11px;">'+
        '<thead><tr><th>Site</th><th>Sales</th><th>Shiftboard live<br>turnover / eligible employee</th><th>Reference scheme<br>turnover / eligible employee</th><th>Difference</th><th>Live Davanti<br>units / each receptionist</th><th>Reference Davanti<br>each receptionist</th><th>Add-on pot<br>shared reception</th></tr></thead>'+ 
        '<tbody>'+rows+'</tbody>'+ 
      '</table></div>'+ 
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:13px;">'+
        '<div style="background:var(--panel-2);padding:10px;border:1px solid var(--line-soft);"><b style="font-size:11px;">Turnover</b><div style="font-size:11px;color:var(--muted);margin-top:4px;">Reference: branch start bonus, then +£50 for every complete £5,000 above target, uncapped.</div></div>'+ 
        '<div style="background:var(--panel-2);padding:10px;border:1px solid var(--line-soft);"><b style="font-size:11px;">Tracking / add-ons</b><div style="font-size:11px;color:var(--muted);margin-top:4px;">0–49 tracking = £1 each. At 50+, every tracking = £2. BFC, Coolant, Pollen, A/C and Diagnostics = £1 each. Pot split equally across reception.</div></div>'+ 
        '<div style="background:var(--panel-2);padding:10px;border:1px solid var(--line-soft);"><b style="font-size:11px;">Davanti</b><div style="font-size:11px;color:var(--muted);margin-top:4px;">£50 at site target, then +£2 per tyre above target. Full Davanti amount is paid to each receptionist, not divided.</div></div>'+ 
      '</div>'+ 
      '<div style="font-size:10px;color:var(--muted-2);margin-top:10px;">Lido turnover is intentionally left unset in the reference column because no confirmed starting turnover target/base bonus was recovered. Existing Shiftboard calculations remain untouched.</div>'+ 
    '</div>';
  }

  try{
    if(typeof renderAdminBonus==='function'){
      const originalRenderAdminBonus=renderAdminBonus;
      renderAdminBonus=function(){
        const html=originalRenderAdminBonus.apply(this,arguments);
        return html+tonyOnlyComparison();
      };
      try{ window.renderAdminBonus=renderAdminBonus; }catch(_e){}
    }
  }catch(_e){}
})();
