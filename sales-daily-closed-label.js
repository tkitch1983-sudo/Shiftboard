(function(){
  'use strict';

  try{
    if(typeof renderAdminSales!=='function' || typeof authHeaders!=='function') return;

    const originalRenderAdminSales=renderAdminSales;
    let liveSnapshot='';
    let closedSnapshot='';
    let loading=false;

    function dateLabel(v){
      if(typeof salesDateLabel==='function') return salesDateLabel(v);
      const d=new Date(String(v)+'T00:00:00');
      return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    }
    function shortDate(v){
      const d=new Date(String(v)+'T00:00:00');
      return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}).toUpperCase();
    }

    async function loadClosedSnapshot(snapshotDate){
      if(!snapshotDate || loading) return;
      loading=true;
      try{
        const headers=await authHeaders();
        headers['Content-Type']='application/json';
        const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/sales_daily_same_date',{
          method:'POST',headers,cache:'no-store',body:JSON.stringify({p_snapshot_date:snapshotDate})
        });
        if(!res.ok) throw new Error('sales_daily_same_date '+res.status);
        const rows=await res.json();
        closedSnapshot=Array.isArray(rows)&&rows[0]&&rows[0].snapshot_date
          ? String(rows[0].snapshot_date)
          : snapshotDate;
      }catch(_e){
        closedSnapshot=snapshotDate;
      }finally{
        loading=false;
        try{
          if(state&&state.admin&&state.admin.tab==='sales'&&typeof render==='function') render();
        }catch(_e){}
      }
    }

    function correctDailyLabels(html,snapshotDate){
      if(typeof html!=='string' || !closedSnapshot || closedSnapshot===snapshotDate) return html;
      const currentYear=Number(String(snapshotDate).slice(0,4));
      const closedYear=Number(String(closedSnapshot).slice(0,4));
      if(!Number.isFinite(currentYear)||!Number.isFinite(closedYear)) return html;

      const oldLong=dateLabel(snapshotDate);
      const newLong=dateLabel(closedSnapshot);
      const oldShort=shortDate(snapshotDate);
      const newShort=shortDate(closedSnapshot);

      html=html.split('Sales on '+oldLong).join('Sales on '+newLong);
      html=html.split('Daily '+currentYear+' · '+oldShort).join('Daily '+closedYear+' · '+newShort);
      html=html.split('Daily '+(currentYear-1)+' · '+oldShort).join('Daily '+(closedYear-1)+' · '+newShort);
      return html;
    }

    renderAdminSales=function(){
      let html=originalRenderAdminSales.apply(this,arguments);
      const rows=state&&state.admin?state.admin.salesRows:null;
      const snapshotDate=Array.isArray(rows)&&rows[0]?String(rows[0].snapshot_date||''):'';
      if(snapshotDate && snapshotDate!==liveSnapshot){
        liveSnapshot=snapshotDate;
        closedSnapshot='';
        setTimeout(()=>loadClosedSnapshot(snapshotDate),0);
      }
      return correctDailyLabels(html,snapshotDate);
    };
  }catch(err){
    console.error('Daily closed-day label setup failed:',err);
  }
})();
