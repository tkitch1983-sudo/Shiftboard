/* Registration-first AutoWork invoice lookup for Tony. No changes to invoices in AutoWork. */
(function(){
'use strict';
const TABLE='autowork_invoice_lookup';
const SITES={
  hartlepool:'Hartlepool',seaham:'Seaham',peterlee:'Peterlee',
  middlesbrough:'Middlesbrough',gateshead:'Gateshead',fairfield:'Fairfield',
  'chester-le-street':'Chester-le-Street',lido:'Lido'
};
const V={reg:'',date:'',amount:'',site:'hartlepool',importSite:'hartlepool',
  busy:false,importing:false,searched:false,results:[],message:'',importMessage:'',
  owner:''};
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeReg=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
const normalizeHeader=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const amount=v=>{
  const n=Number(String(v??'').replace(/[£,$\s]/g,'').replace(/^\((.*)\)$/,'-$1'));
  return v==null||String(v).trim()===''||!Number.isFinite(n)?null:Math.round(n*100)/100;
};
const pounds=v=>v===null||v===undefined?'Not recorded':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v));
const canUse=()=>typeof isTonyLogin==='function'&&isTonyLogin();
const active=()=>canUse()&&typeof state!=='undefined'&&state.view==='admin'&&
  (state.admin?.tab==='jobs'||state.admin?.tab==='remittances');
const refresh=()=>{if(active()&&typeof window.render==='function')window.render();};
function resetIfAccountChanged(){
  const next=typeof _session==='object'&&_session?String(_session.email||'').toLowerCase():'';
  if(V.owner!==next){Object.assign(V,{reg:'',date:'',amount:'',site:'hartlepool',importSite:'hartlepool',
    busy:false,importing:false,searched:false,results:[],message:'',importMessage:'',owner:next});}
}
async function request(path,method,body,prefer){
  const headers=await authHeaders();
  if(prefer)headers.Prefer=prefer;
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+TABLE+path,{
    method:method||'GET',headers,cache:'no-store',
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!r.ok){
    const detail=(await r.text()).slice(0,150);
    throw Error('Invoice lookup unavailable (HTTP '+r.status+'). '+detail);
  }
  return (method||'GET')==='GET'?r.json():null;
}
const siteOptions=(picked,all)=> (all?'<option value="all">All workshops</option>':'')+
  Object.entries(SITES).map(([key,label])=>'<option value="'+E(key)+'"'+(picked===key?' selected':'')+'>'+E(label)+'</option>').join('');
function deltaDays(a,b){
  if(!a||!b)return null;
  const x=Date.parse(a+'T12:00:00Z'),y=Date.parse(b+'T12:00:00Z');
  return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y)/86400000:null;
}
function assess(r){
  const days=deltaDays(V.date,r.invoice_date);
  const listed=[r.total_amount,r.net_amount].filter(x=>x!==null&&x!==undefined).map(Number);
  const target=amount(V.amount);
  const close=target!==null&&listed.some(x=>Math.abs(x-target)<=0.02);
  const missingAmount=listed.length===0;
  const score=(days===0?40:days!==null&&days<=7?25:days!==null&&days<=30?5:0)+
    (close?35:missingAmount?0:5);
  const note=days===0&&close?'Registration, date and amount agree':
    days!==null&&days<=7&&close?'Registration and amount agree; dates differ':
    days!==null&&days<=7?'Registration and nearby invoice date':
    close?'Registration and amount agree; check invoice date':'Registration matches; review date and amount';
  return {...r,score,note,days,close};
}
async function search(){
  if(!canUse()||V.busy)return;
  const reg=normalizeReg(V.reg);
  if(reg.length<4){V.message='Enter a valid registration (for example YR75FHM).';V.results=[];V.searched=false;refresh();return;}
  const a=String(V.amount||'').trim();
  if(a&&amount(a)===null){V.message='Enter a valid amount, or leave it blank.';refresh();return;}
  V.busy=true;V.message='';V.searched=false;refresh();
  try{
    let path='?select=site_key,registration,invoice_number,job_number,invoice_date,total_amount,net_amount,source_file,imported_at'+
      '&registration=eq.'+encodeURIComponent(reg)+'&limit=200';
    if(V.site!=='all')path+='&site_key=eq.'+encodeURIComponent(V.site);
    const rows=await request(path);
    if(!canUse())return;
    V.results=(Array.isArray(rows)?rows:[]).map(assess).sort((a,b)=>b.score-a.score||
      String(b.invoice_date||'').localeCompare(String(a.invoice_date||''))).slice(0,80);
    V.searched=true;
    V.message=V.results.length?
      V.results.length+' invoice record(s) have this exact registration. Confirm the original invoice before allocating payment.':
      'No exact registration match is indexed. This does not mean the invoice is missing from AutoWork.';
  }catch(err){V.message=err.message||'Invoice search failed.';V.results=[];V.searched=false;}
  finally{V.busy=false;refresh();}
}
function dateIso(v){
  if(v instanceof Date&&!Number.isNaN(+v))return v.toISOString().slice(0,10);
  const s=String(v??'').trim();
  if(!s)return null;
  let y,m,d;
  let a=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(a){y=+a[1];m=+a[2];d=+a[3];}
  else{
    a=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if(a){d=+a[1];m=+a[2];y=+a[3];}
    else if(/^\d{5}(?:\.0+)?$/.test(s)){
      const dt=new Date(Date.UTC(1899,11,30)+Number(s)*86400000);
      return Number.isNaN(+dt)?null:dt.toISOString().slice(0,10);
    }else return null;
  }
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?
    dt.toISOString().slice(0,10):null;
}
function branch(v,fallback){
  const key=normalizeHeader(v);
  if(!key)return fallback;
  const found=Object.keys(SITES).find(k=>normalizeHeader(k)===key);
  if(found)return found;
  if(key.includes('chester')&&key.includes('street'))return 'chester-le-street';
  if(key.includes('hartlepool'))return 'hartlepool';
  if(key.includes('middlesbrough'))return 'middlesbrough';
  if(key.includes('peterlee'))return 'peterlee';
  if(key.includes('seaham'))return 'seaham';
  if(key.includes('fairfield'))return 'fairfield';
  if(key.includes('gateshead'))return 'gateshead';
  if(key==='lido')return 'lido';
  return null;
}
function columns(row){
  const h=row.map(normalizeHeader);
  const first=(names,predicate)=>{
    for(const n of names){const i=h.indexOf(n);if(i>=0)return i;}
    return h.findIndex(v=>v&&predicate(v));
  };
  const reg=first(['registration','reg','vrm','vehicleregistration','vehicleReg','registrationnumber',
    'vehiclereg','regno','registrationno','carreg'],x=>x.includes('registration')||x==='vrm');
  const invoice=first(['invoicenumber','invoiceno','invoiceref','invoicereference','invoiceid','invoicecode',
    'invoice','invno','invnumber','invref','documentnumber'],x=>
    (x.startsWith('invoice')||x.startsWith('inv'))&&
    !/(date|amount|value|total|vat|type|net|gross)/.test(x));
  const date=first(['invoicedate','transactiondate','documentdate','date','createddate'],
    x=>x.endsWith('invoicedate')||x==='date');
  const total=first(['totalincvat','grossamount','invoiceamount','invoicetotal',
    'amountincvat','totalamount','gross','total','amount','value','totalvalue'],
    x=>(x.includes('gross')||x.includes('total'))&&!x.includes('net')&&!x.includes('exvat'));
  const net=first(['netamount','netvalue','totalexvat','amountexvat','subtotal','nett','net'],
    x=>x.includes('exvat')||x.startsWith('net'));
  const job=first(['jobnumber','jobno','jobref','jobreference','job'],x=>x.startsWith('job')&&!x.includes('date'));
  const site=first(['branch','workshop','site','centre','location','depot'],
    x=>x==='branch'||x==='workshop');
  return {reg,invoice,date,total,net,job,site};
}
function parseWorkbook(wb,siteKey,fileName){
  const seen=new Map(),duplicates=new Set();
  let inspected=0,skipped=0,recognized=0;
  for(const sheetName of wb.SheetNames.slice(0,12)){
    const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:false,defval:''});
    let head=-1,col=null;
    for(let i=0;i<Math.min(30,matrix.length);i++){
      const c=columns(Array.isArray(matrix[i])?matrix[i]:[]);
      if(c.reg>=0&&c.invoice>=0){head=i;col=c;break;}
    }
    if(head<0)continue;
    recognized++;
    for(const row of matrix.slice(head+1)){
      if(!Array.isArray(row)||row.every(x=>String(x??'').trim()===''))continue;
      inspected++;
      if(inspected>10000)throw Error('This file has more than 10,000 rows. Export a smaller invoice list.');
      const reg=normalizeReg(row[col.reg]);
      const inv=String(row[col.invoice]??'').trim().toUpperCase().replace(/\s+/g,'');
      const site=col.site>=0?branch(row[col.site],siteKey):siteKey;
      if(!site||reg.length<4||!/^[A-Z0-9._\/-]{2,60}$/.test(inv)){skipped++;continue;}
      const key=site+'|'+inv;
      if(duplicates.has(key))continue;
      if(seen.has(key)){seen.delete(key);duplicates.add(key);continue;}
      seen.set(key,{
        site_key:site,invoice_number:inv,registration:reg,
        invoice_date:col.date>=0?dateIso(row[col.date]):null,
        job_number:col.job>=0?String(row[col.job]??'').trim().slice(0,60)||null:null,
        total_amount:col.total>=0?amount(row[col.total]):null,
        net_amount:col.net>=0?amount(row[col.net]):null,
        source_file:String(fileName).replace(/[\r\n]/g,' ').slice(0,180)
      });
    }
  }
  if(!recognized)throw Error('No invoice list found. Include columns headed Registration and Invoice Number.');
  return {records:[...seen.values()],duplicates:duplicates.size,skipped,inspected};
}
async function importFile(file){
  if(!canUse()||V.importing)return;
  if(!file){V.importMessage='Choose an AutoWork invoice export first.';refresh();return;}
  if(!/\.(xlsx|xls|csv|txt)$/i.test(file.name)){V.importMessage='Use an AutoWork CSV or Excel invoice list.';refresh();return;}
  if(file.size>8*1024*1024){V.importMessage='File too large. Use an export under 8 MB.';refresh();return;}
  V.importing=true;V.importMessage='Reading invoice export…';refresh();
  try{
    if(!window.XLSX)throw Error('Excel/CSV reader not available. Reload the page and try again.');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const parsed=parseWorkbook(wb,V.importSite,file.name);
    if(!parsed.records.length)throw Error('No usable invoice rows. Check registrations, invoice numbers and branch names.');
    V.importMessage='Importing '+parsed.records.length+' indexed invoices…';refresh();
    for(let i=0;i<parsed.records.length;i+=100){
      await request('?on_conflict=site_key,invoice_number','POST',parsed.records.slice(i,i+100),
        'resolution=merge-duplicates,return=minimal');
    }
    V.importMessage='Imported '+parsed.records.length+' invoice records from '+file.name+
      '. '+parsed.duplicates+' repeated invoice numbers skipped; '+parsed.skipped+' invalid rows skipped.';
    if(normalizeReg(V.reg).length>=4)await search();
  }catch(err){V.importMessage='Import not completed: '+(err.message||'Unknown error');}
  finally{V.importing=false;refresh();}
}
function resultRows(){
  return V.results.map(r=>{
    const exportTotal=r.total_amount===null?'—':pounds(r.total_amount);
    const exportNet=r.net_amount===null?'—':pounds(r.net_amount);
    const note=r.note;
    return '<tr><td><b class="mono">'+E(r.invoice_number)+'</b><div class="il-muted">Job '+E(r.job_number||'not supplied')+'</div></td>'+
      '<td>'+E(SITES[r.site_key]||r.site_key)+'</td>'+
      '<td>'+E(r.invoice_date||'Not supplied')+'</td>'+
      '<td>'+E(exportTotal)+'</td><td>'+E(exportNet)+'</td>'+
      '<td>'+E(note)+'<div class="il-muted">Source: '+E(r.source_file||'AutoWork export')+'</div></td></tr>';
  }).join('');
}
function render(){
  if(!canUse())return '';
  resetIfAccountChanged();
  return '<section class="card il-root"><style>.il-root{margin:18px 0}.il-root h3{margin:0 0 4px;font-size:17px}.il-muted{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.55}.il-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:14px 0}.il-fields label{display:flex;flex-direction:column;gap:5px;font-size:12px}.il-fields input,.il-fields select,.il-root input[type=file]{border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);padding:10px;width:100%;box-sizing:border-box}.il-buttons{display:flex;gap:9px;flex-wrap:wrap;margin:10px 0}.il-divider{border-top:1px solid var(--line);margin:20px 0}.il-root table{min-width:760px}.il-root th,.il-root td{font-size:12px;text-align:left;padding:9px}.il-root button:disabled{opacity:.6;cursor:wait}</style>'+
    '<h3>AutoWork Invoice Checker · Registration lookup</h3>'+
    '<div class="il-muted">Search by vehicle registration, then compare the invoice date and amount. This finds the <b>AutoWork invoice number</b>, not the supplier payment reference. Results are evidence to confirm against the original invoice.</div>'+
    '<div class="il-fields">'+
    '<label>Registration<input data-il-field="reg" value="'+E(V.reg)+'" placeholder="YR75FHM" maxlength="14" autocomplete="off"></label>'+
    '<label>Invoice / job date<input type="date" data-il-field="date" value="'+E(V.date)+'"></label>'+
    '<label>Supplier PI amount (£)<input data-il-field="amount" inputmode="decimal" value="'+E(V.amount)+'" placeholder="91.06"></label>'+
    '<label>Workshop<select data-il-field="site">'+siteOptions(V.site,true)+'</select></label></div>'+
    '<div class="il-buttons"><button type="button" class="add-btn" data-il-action="search"'+(V.busy?' disabled':'')+'>'+ (V.busy?'Checking…':'Find AutoWork invoice')+'</button></div>'+
    (V.message?'<div class="il-muted" role="status">'+E(V.message)+'</div>':'')+
    (V.searched&&V.results.length?'<div style="overflow:auto;margin-top:12px"><table><thead><tr><th>AutoWork invoice</th><th>Site</th><th>Invoice date</th><th>Export total</th><th>Net amount</th><th>Evidence</th></tr></thead><tbody>'+resultRows()+'</tbody></table></div>':'')+
    '<div class="il-divider"></div>'+
    '<details'+(V.importMessage?' open':'')+'><summary style="cursor:pointer;font-weight:650;font-size:13px">Add invoice records from an AutoWork export</summary>'+
    '<p class="il-muted">Shiftboard currently indexes job/invoice numbers from Profit Tracker, but not registrations. Upload an AutoWork invoice list (CSV or Excel) with <b>Registration</b> and <b>Invoice Number</b> columns; date, total, job and branch are used when supplied. Imported records are private to Tony and can be searched again later. Export one row per invoice.</p>'+
    '<div class="il-fields"><label>Workshop when no branch column exists<select data-il-field="importSite">'+siteOptions(V.importSite,false)+'</select></label>'+
    '<label>AutoWork invoice list<input id="il-import-file" type="file" accept=".csv,.xls,.xlsx,.txt"></label></div>'+
    '<div class="il-buttons"><button type="button" class="add-btn" data-il-action="import"'+(V.importing?' disabled':'')+'>'+(V.importing?'Importing…':'Import invoice list')+'</button></div>'+
    (V.importMessage?'<div role="status" class="il-muted">'+E(V.importMessage)+'</div>':'')+
    '</details></section>';
}
document.addEventListener('input',event=>{
  const el=event.target.closest?.('[data-il-field]');
  if(!el||!active())return;
  if(Object.hasOwn(V,el.dataset.ilField))V[el.dataset.ilField]=el.value;
});
document.addEventListener('change',event=>{
  const el=event.target.closest?.('[data-il-field]');
  if(!el||!active())return;
  if(Object.hasOwn(V,el.dataset.ilField))V[el.dataset.ilField]=el.value;
});
document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-il-action]');
  if(!el||!active())return;
  if(el.dataset.ilAction==='search'){search();return;}
  if(el.dataset.ilAction==='import'){
    const file=document.getElementById('il-import-file')?.files?.[0];
    importFile(file);
  }
});
window.NEASInvoiceLookup={render};
})();
