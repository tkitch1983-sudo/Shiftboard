(() => {
  "use strict";

  const API = "https://disgpocvqitpeceqhuim.supabase.co/functions/v1/shiftboard-remittances";
  const local = {
    loaded:false, loading:false, busy:false, error:"",
    status:null, docs:[], targets:[], rules:[],
    filter:{date:"",amount:"",supplier:""},
    selectedTargetId:null,
    connectSession:null, connectCode:"", connectUri:"", connectInterval:8,
    notice:"",
    autoSupplier:"arval", autoPayment:"", autoValues:"", autoResults:[], autoGrossTarget:null,
    ocrBusy:false, ocrMessage:""
  };
  let pollTimer = null;
  const CONNECT_STORE = "neas-remittance-connect-v1";
  function saveConnectState(){
    try{
      if(!local.connectSession){ localStorage.removeItem(CONNECT_STORE); return; }
      localStorage.setItem(CONNECT_STORE,JSON.stringify({
        session:local.connectSession,code:local.connectCode,uri:local.connectUri,
        interval:local.connectInterval,savedAt:Date.now()
      }));
    }catch(_e){}
  }
  function restoreConnectState(){
    try{
      const raw=localStorage.getItem(CONNECT_STORE); if(!raw) return;
      const x=JSON.parse(raw);
      if(!x||!x.session||Date.now()-Number(x.savedAt||0)>30*60*1000){ localStorage.removeItem(CONNECT_STORE); return; }
      local.connectSession=String(x.session);
      local.connectCode=String(x.code||"");
      local.connectUri=String(x.uri||"https://microsoft.com/devicelogin");
      local.connectInterval=Math.max(6,Number(x.interval||8));
    }catch(_e){}
  }
  restoreConnectState();

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function money(v){
    const n = Number(v);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
      : "—";
  }
  function dateLabel(v){
    if(!v) return "—";
    const d = new Date(String(v).slice(0,10) + "T12:00:00");
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString("en-GB");
  }
  function dateTimeLabel(v){
    if(!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleString("en-GB",{dateStyle:"short",timeStyle:"short"});
  }
  function number2(v){ return Math.round((Number(v)||0)*100)/100; }
  function supplierKey(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,""); }
  function renderNow(){ if(typeof window.render === "function") window.render(); }

  async function api(action, extra){
    const headers = await authHeaders();
    headers["Content-Type"] = "application/json";
    const res = await fetch(API,{
      method:"POST",headers,cache:"no-store",
      body:JSON.stringify(Object.assign({action},extra||{}))
    });
    let body;
    try{ body = await res.json(); }catch(_e){ body = {}; }
    if(!res.ok) throw new Error(body.error || "Remittance service failed.");
    return body;
  }
  async function rest(path, options){
    const baseHeaders = await authHeaders();
    const opts = Object.assign({method:"GET",cache:"no-store"},options||{});
    const headers = Object.assign({},baseHeaders,(options&&options.headers)||{});
    opts.headers=headers;
    if(opts.body && typeof opts.body !== "string"){
      headers["Content-Type"]="application/json";
      opts.body=JSON.stringify(opts.body);
    }
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
    const txt = await res.text();
    if(!res.ok) throw new Error("Remittance data " + res.status + (txt ? ": " + txt.slice(0,160) : ""));
    return txt ? JSON.parse(txt) : null;
  }

  async function load(force){
    if(local.loading) return;
    if(local.loaded && !force) return;
    local.loading=true; local.error="";
    try{
      const results = await Promise.all([
        api("status"),
        rest("remittance_documents?select=id,supplier,payment_date,payment_amount,candidate_amounts,received_at,sender_email,sender_name,subject,attachment_name,attachment_size,indexed_at&order=received_at.desc&limit=1500"),
        rest("remittance_targets?select=id,supplier,payment_date,amount,status,matched_document_id,source_subject,source_text,source_received_at,created_at,updated_at&order=payment_date.desc,amount.desc&limit=1500"),
        rest("remittance_supplier_rules?select=supplier_key,display_name,deduction_percent,deduction_vat_percent,notes&active=eq.true&order=display_name.asc")
      ]);
      local.status=results[0]||{};
      local.docs=Array.isArray(results[1])?results[1]:[];
      local.targets=Array.isArray(results[2])?results[2]:[];
      local.rules=Array.isArray(results[3])?results[3]:[];
      local.loaded=true;
    }catch(e){
      local.error=e.message||String(e);
    }finally{
      local.loading=false;
      if(state && state.admin && state.admin.tab==="remittances") renderNow();
    }
  }

  function scheduleLoad(){
    if(!local.loading && !local.loaded) setTimeout(()=>load(false),0);
  }

  function supplierOptions(selected, includeAll){
    const seen=new Map();
    (local.rules||[]).forEach(r=>seen.set(supplierKey(r.display_name),r.display_name));
    (local.targets||[]).forEach(r=>{ const k=supplierKey(r.supplier); if(k&&!seen.has(k)) seen.set(k,r.supplier); });
    (local.docs||[]).forEach(r=>{ const k=supplierKey(r.supplier); if(k&&!seen.has(k)) seen.set(k,r.supplier); });
    const arr=[...seen.values()].sort((a,b)=>String(a).localeCompare(String(b)));
    return (includeAll?'<option value="">All suppliers</option>':'') +
      arr.map(v=>'<option value="'+esc(v)+'" '+(String(selected||"")===String(v)?"selected":"")+'>'+esc(v)+'</option>').join("");
  }

  function docById(id){ return (local.docs||[]).find(d=>d.id===id)||null; }
  function targetById(id){ return (local.targets||[]).find(t=>t.id===id)||null; }

  function filteredDocs(){
    const f=local.filter||{};
    const amountRaw=String(f.amount||"").replace(/[£,\s]/g,"");
    const amount=amountRaw===""?null:Number(amountRaw);
    const supplier=supplierKey(f.supplier);
    return (local.docs||[]).filter(d=>{
      if(f.date){
        const received=String(d.received_at||"").slice(0,10);
        if(String(d.payment_date||"")!==f.date && received!==f.date) return false;
      }
      if(Number.isFinite(amount)){
        const candidates=Array.isArray(d.candidate_amounts)?d.candidate_amounts:[];
        const exact=Number.isFinite(Number(d.payment_amount)) && Math.abs(Number(d.payment_amount)-amount)<=0.021;
        const alternate=candidates.some(v=>Math.abs(Number(v)-amount)<=0.021);
        if(!exact&&!alternate) return false;
      }
      if(supplier){
        const hay=supplierKey([d.supplier,d.sender_name,d.sender_email,d.subject].join(" "));
        if(!hay.includes(supplier)) return false;
      }
      return true;
    });
  }

  function renderConnection(){
    const s=local.status||{};
    const scan=s.scan||{};
    if(!s.connected){
      const connect = local.connectSession
        ? '<div class="card" style="border-left:4px solid var(--amber);margin-top:12px;">'
          +'<b>Microsoft sign-in code</b>'
          +'<div class="mono" style="font-size:28px;margin:12px 0;letter-spacing:2px;">'+esc(local.connectCode)+'</div>'
          +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'
          +'<a class="add-btn" href="'+esc(local.connectUri||"https://microsoft.com/devicelogin")+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Open Microsoft sign-in</a>'
          +'<button class="add-btn" type="button" data-remit-action="copy-code">Copy code</button>'
          +'<button class="add-btn" type="button" data-remit-action="poll-connect">Check connection</button>'
          +'</div><div style="font-size:12px;color:var(--muted);margin-top:10px;">Sign in as Tony. Shift Board requests read-only access to mail Tony can already access, then tests the remittance mailbox.</div></div>'
        : '<button type="button" class="action-btn" data-remit-action="connect" style="max-width:360px;">Connect remittance mailbox (read only)</button>';
      return '<div class="card" style="border-left:4px solid var(--amber);">'
        +'<b>Remittance mailbox is not connected yet</b>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5;">Connect Tony to <b>remittance@neautoservices.com</b>. Shift Board will only read/index messages and PDF attachments; it will not move, delete or send mail from that mailbox.</div>'
        +connect+'</div>';
    }
    const msg=scan.last_scan_message||"Connected and ready.";
    const tone=scan.last_scan_status==="error"?"var(--red)":scan.last_scan_status==="ok"?"var(--green)":"var(--amber)";
    return '<div class="card" style="border-left:4px solid '+tone+';">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">'
      +'<div><b>remittance@neautoservices.com connected</b>'
      +'<div style="font-size:12px;color:var(--muted);margin-top:4px;">'+esc(msg)+'</div>'
      +'<div style="font-size:11px;color:var(--muted-2);margin-top:5px;">Last completed: '+dateTimeLabel(scan.last_scan_completed_at)+' · automatic check every 3 hours</div></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +'<button type="button" class="add-btn" data-remit-action="scan">Check now</button>'
      +'<button type="button" class="add-btn" data-remit-action="full-scan">Build / extend library</button>'
      +'</div></div></div>';
  }

  function renderKpis(){
    const s=local.status||{}, c=s.counts||{};
    const open=(local.targets||[]).filter(t=>t.status==="to_find"||t.status==="review").length;
    const found=(local.targets||[]).filter(t=>t.status==="found").length;
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0;">'
      +'<div class="tony-kpi primary"><div class="tony-kpi-label">PDFs indexed</div><div class="tony-kpi-value">'+Number(c.documents||local.docs.length||0)+'</div><div class="tony-kpi-note">Private remittance library</div></div>'
      +'<div class="tony-kpi"><div class="tony-kpi-label">To find</div><div class="tony-kpi-value">'+open+'</div><div class="tony-kpi-note">Unmatched / review payments</div></div>'
      +'<div class="tony-kpi good"><div class="tony-kpi-label">Found</div><div class="tony-kpi-value">'+found+'</div><div class="tony-kpi-note">Matched to a stored PDF</div></div>'
      +'</div>';
  }

  function renderSearch(){
    const docs=filteredDocs().slice(0,50);
    const selected=local.selectedTargetId?targetById(local.selectedTargetId):null;
    const rows=docs.map(d=>{
      const exact=Number.isFinite(Number(d.payment_amount))?money(d.payment_amount):"Amount not extracted";
      const matchButton=selected
        ? '<button type="button" class="btn-sm approve" data-remit-action="match-doc" data-doc="'+esc(d.id)+'">Match this PDF</button>'
        : '';
      return '<tr>'
        +'<td><b>'+(esc(d.supplier||"Unknown"))+'</b><div style="font-size:11px;color:var(--muted-2);">'+esc(d.subject||"")+'</div></td>'
        +'<td class="mono">'+dateLabel(d.payment_date||String(d.received_at||"").slice(0,10))+'</td>'
        +'<td class="mono"><b>'+exact+'</b></td>'
        +'<td>'+esc(d.attachment_name||"remittance.pdf")+'</td>'
        +'<td style="white-space:nowrap;"><button type="button" class="btn-sm" data-remit-action="open-pdf" data-doc="'+esc(d.id)+'">Open / Print PDF</button>'+matchButton+'</td>'
        +'</tr>';
    }).join("");
    return '<div class="card">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">'
      +'<div><b style="font-size:15px;">Find a remittance</b><div style="font-size:11px;color:var(--muted-2);margin-top:3px;">Search by payment date, value, supplier, or any combination.</div></div>'
      +(selected?'<div class="pill pill-pending">Matching: '+esc(selected.supplier)+' '+money(selected.amount)+' · '+dateLabel(selected.payment_date)+'</div>':'')
      +'</div>'
      +'<div class="form-row">'
      +'<div class="field"><label>Date</label><input type="date" data-remit-filter="date" value="'+esc(local.filter.date)+'"></div>'
      +'<div class="field"><label>Payment value</label><input inputmode="decimal" placeholder="636.80" data-remit-filter="amount" value="'+esc(local.filter.amount)+'"></div>'
      +'<div class="field"><label>Supplier</label><select data-remit-filter="supplier">'+supplierOptions(local.filter.supplier,true)+'</select></div>'
      +'<button type="button" class="add-btn" data-remit-action="apply-search">Search</button>'
      +'<button type="button" class="add-btn" data-remit-action="clear-search">Clear</button>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--muted-2);margin-bottom:8px;">'+docs.length+' result'+(docs.length===1?"":"s")+(filteredDocs().length>50?" · showing first 50":"")+'</div>'
      +'<div style="overflow:auto;"><table style="min-width:850px;"><thead><tr><th>Supplier</th><th>Payment date</th><th>Value</th><th>PDF</th><th>Action</th></tr></thead><tbody>'
      +(rows||'<tr><td colspan="5" class="empty-state">No indexed remittance matches those filters.</td></tr>')
      +'</tbody></table></div></div>';
  }

  function renderTargets(){
    const rows=(local.targets||[]).slice(0,250).map(t=>{
      const doc=t.matched_document_id?docById(t.matched_document_id):null;
      const status=t.status==="found"
        ? '<span class="pill pill-approved">FOUND</span>'
        : t.status==="review"
          ? '<span class="pill pill-pending">REVIEW</span>'
          : '<span class="pill pill-rejected">TO FIND</span>';
      const action=t.status==="found"&&doc
        ? '<button type="button" class="btn-sm" data-remit-action="open-pdf" data-doc="'+esc(doc.id)+'">Open / Print PDF</button>'
        : '<button type="button" class="btn-sm" data-remit-action="search-target" data-target="'+esc(t.id)+'">Find</button>';
      return '<tr><td>'+status+'</td><td><b>'+esc(t.supplier)+'</b><div style="font-size:10px;color:var(--muted-2);">'+esc(t.source_text||t.source_subject||"Manual")+'</div></td>'
        +'<td class="mono">'+dateLabel(t.payment_date)+'</td><td class="mono"><b>'+money(t.amount)+'</b></td><td>'+action+'</td></tr>';
    }).join("");
    return '<div class="card">'
      +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">'
      +'<div><b style="font-size:15px;">Remittances to find</b><div style="font-size:11px;color:var(--muted-2);margin-top:3px;">Forward Jack’s list to Shiftboard and these entries are created automatically.</div></div>'
      +'</div>'
      +'<div class="form-row" style="padding:10px;border:1px solid var(--line-soft);">'
      +'<div class="field"><label>Supplier</label><input id="remit-add-supplier" placeholder="Arval"></div>'
      +'<div class="field"><label>Date</label><input id="remit-add-date" type="date"></div>'
      +'<div class="field"><label>Amount</label><input id="remit-add-amount" inputmode="decimal" placeholder="636.80"></div>'
      +'<button type="button" class="add-btn" data-remit-action="add-target">Add manually</button></div>'
      +'<div style="overflow:auto;"><table style="min-width:720px;"><thead><tr><th>Status</th><th>Supplier</th><th>Date</th><th>Payment</th><th>Action</th></tr></thead><tbody>'
      +(rows||'<tr><td colspan="5" class="empty-state">No remittance requests have been imported yet.</td></tr>')
      +'</tbody></table></div></div>';
  }

  function ruleForSupplier(value){
    const k=supplierKey(value);
    return (local.rules||[]).find(r=>supplierKey(r.supplier_key)===k||supplierKey(r.display_name)===k) || {supplier_key:k,display_name:value||"Other",deduction_percent:0,deduction_vat_percent:0};
  }
  function expectedNet(gross,rule){
    const d=Number(rule.deduction_percent||0), vat=Number(rule.deduction_vat_percent||0);
    const fee=number2(gross*d);
    const feeVat=number2(fee*vat);
    return number2(gross-fee-feeVat);
  }
  function expectedNetLinewise(values,rule){
    return number2(values.reduce((n,v)=>n+expectedNet(v,rule),0));
  }
  function parseValues(text){
    const matches=String(text||"").match(/\d{1,6}(?:,\d{3})*\.\d{2}/g)||[];
    return matches.map(v=>Number(v.replace(/,/g,""))).filter(v=>Number.isFinite(v)&&v>0&&v<100000).slice(0,150);
  }
  function calculateAutoWork(){
    const payment=Number(String(local.autoPayment||"").replace(/[£,\s]/g,""));
    if(!Number.isFinite(payment)||payment<=0){ local.autoResults=[]; local.ocrMessage="Enter the remittance payment amount."; return; }
    const values=parseValues(local.autoValues);
    if(!values.length){ local.autoResults=[]; local.ocrMessage="Paste AutoWork values or upload a screenshot first."; return; }
    const rule=ruleForSupplier(local.autoSupplier);
    const d=Number(rule.deduction_percent||0), vat=Number(rule.deduction_vat_percent||0);
    const multiplier=1-d*(1+vat);
    local.autoGrossTarget=multiplier>0?number2(payment/multiplier):payment;
    const found=[];
    function consider(indexes){
      const vals=indexes.map(i=>values[i]);
      const gross=number2(vals.reduce((a,b)=>a+b,0));
      const netCombined=expectedNet(gross,rule);
      const netLine=expectedNetLinewise(vals,rule);
      const diff=Math.min(Math.abs(netCombined-payment),Math.abs(netLine-payment));
      const grossDiff=Math.abs(gross-local.autoGrossTarget);
      if(diff<=0.06 || grossDiff<=0.06){
        found.push({indexes,vals,gross,netCombined,netLine,diff,grossDiff});
      }
    }
    for(let i=0;i<values.length;i++) consider([i]);
    for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++) consider([i,j]);
    if(values.length<=120){
      for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++) for(let k=j+1;k<values.length;k++) consider([i,j,k]);
    }
    found.sort((a,b)=>a.diff-b.diff||a.grossDiff-b.grossDiff||a.vals.length-b.vals.length);
    local.autoResults=found.slice(0,12);
    local.ocrMessage=found.length ? found.length+" possible match"+(found.length===1?"":"es")+" found." : "No close 1, 2 or 3-value match found.";
  }

  function renderAutoWork(){
    const rule=ruleForSupplier(local.autoSupplier);
    const results=(local.autoResults||[]).map((r,i)=>{
      const vals=r.vals.map(v=>money(v)).join(" + ");
      const netDiff=Math.min(Math.abs(r.netCombined-Number(local.autoPayment||0)),Math.abs(r.netLine-Number(local.autoPayment||0)));
      return '<tr><td class="mono">'+(i+1)+'</td><td class="mono"><b>'+vals+'</b></td><td class="mono">'+money(r.gross)+'</td><td class="mono">'+money(r.netCombined)+'</td><td class="mono">'+money(r.netLine)+'</td><td class="mono">'+money(netDiff)+'</td></tr>';
    }).join("");
    return '<div class="card">'
      +'<div><b style="font-size:15px;">AutoWork value finder</b><div style="font-size:11px;color:var(--muted-2);margin-top:3px;">Paste values or upload an AutoWork screenshot. It tests single values and combinations of 2 or 3.</div></div>'
      +'<div class="form-row" style="margin-top:14px;">'
      +'<div class="field"><label>Supplier</label><select data-remit-auto="supplier">'+supplierOptions(local.autoSupplier,false)+'</select></div>'
      +'<div class="field"><label>Remittance payment</label><input inputmode="decimal" data-remit-auto="payment" value="'+esc(local.autoPayment)+'" placeholder="636.80"></div>'
      +'<div class="field"><label>Screenshot / photo</label><input type="file" id="remit-autowork-image" accept="image/*"></div>'
      +'</div>'
      +'<div class="field"><label>AutoWork values</label><textarea rows="6" data-remit-auto="values" placeholder="550.78&#10;135.43&#10;155.03">'+esc(local.autoValues)+'</textarea></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="add-btn" data-remit-action="calculate-autowork">Find combinations</button>'
      +'<button type="button" class="add-btn" data-remit-action="clear-autowork">Clear</button></div>'
      +(local.ocrBusy?'<div style="font-size:12px;color:var(--amber);margin-top:10px;">Reading screenshot on this device…</div>':'')
      +(local.ocrMessage?'<div style="font-size:12px;color:var(--muted);margin-top:10px;">'+esc(local.ocrMessage)+'</div>':'')
      +(local.autoGrossTarget!==null?'<div style="font-size:12px;margin-top:10px;">Expected gross before supplier deduction: <b class="mono">'+money(local.autoGrossTarget)+'</b> · '+esc(rule.notes||"No deduction rule stored.")+'</div>':'')
      +(results?'<div style="overflow:auto;margin-top:12px;"><table style="min-width:760px;"><thead><tr><th>#</th><th>AutoWork values</th><th>Gross total</th><th>Net if fee on total</th><th>Net if fee per line</th><th>Difference</th></tr></thead><tbody>'+results+'</tbody></table></div>':'')
      +'<div style="font-size:10px;color:var(--muted-2);margin-top:10px;">Screenshot OCR runs in your browser; the image is not saved to the remittance library. Always confirm the highlighted values against AutoWork before posting.</div>'
      +'</div>';
  }

  function renderPanel(){
    if(!isTonyLogin()) return '<h2>Remittances</h2><div class="card">This page is private to Tony.</div>';
    scheduleLoad();
    if(local.loading && !local.loaded) return '<h2>Remittances</h2><div class="card">Loading the private remittance library…</div>';
    if(local.error && !local.loaded) return '<h2>Remittances</h2><div class="card" style="color:var(--red);">'+esc(local.error)+'</div>';
    return '<div class="tony-dashboard">'
      +'<div class="tony-hero"><div><div class="tony-hero-title">Remittance Finder</div><div class="tony-hero-sub">Tony only. Search the remittance PDF library by date and value, print the original PDF, match Jack’s missing-payment list, and solve AutoWork combinations.</div></div>'
      +'<button type="button" class="add-btn" data-admin-tab="tonydashboard">← Tony Dashboard</button></div>'
      +(local.notice?'<div class="card" style="border-left:4px solid var(--green);">'+esc(local.notice)+'</div>':'')
      +(local.error?'<div class="card" style="border-left:4px solid var(--red);color:var(--red);">'+esc(local.error)+'</div>':'')
      +renderConnection()+renderKpis()+renderSearch()+renderTargets()+renderAutoWork()
      +'</div>';
  }

  async function refresh(){
    local.loaded=false;
    await load(true);
  }

  async function openPdf(id){
    const w=window.open("about:blank","_blank");
    try{
      const result=await api("pdf_url",{document_id:id});
      if(w) w.location.href=result.url; else window.open(result.url,"_blank","noopener");
    }catch(e){
      if(w) w.close();
      showToast(e.message||"Could not open PDF.",true);
    }
  }

  async function startConnection(){
    if(local.busy) return;
    local.busy=true; local.error="";
    try{
      const result=await api("connect_start");
      local.connectSession=result.session_id;
      local.connectCode=result.user_code||"";
      local.connectUri=result.verification_uri||"https://microsoft.com/devicelogin";
      local.connectInterval=Math.max(6,Number(result.interval_seconds||5)+2);
      saveConnectState();
      startPolling();
      renderNow();
    }catch(e){
      local.error=e.message||String(e); renderNow();
    }finally{ local.busy=false; }
  }

  function startPolling(){
    if(pollTimer) clearInterval(pollTimer);
    if(!local.connectSession) return;
    pollTimer=setInterval(()=>pollConnection(true),local.connectInterval*1000);
  }
  async function pollConnection(silent){
    if(!local.connectSession||local.busy) return;
    local.busy=true;
    try{
      const result=await api("connect_poll",{session_id:local.connectSession});
      if(result.status==="connected"){
        if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
        local.connectSession=null; local.connectCode="";
        saveConnectState();
        local.notice="Remittance mailbox connected. Shift Board can now build the PDF library.";
        local.loaded=false; await load(true);
      }else if(!silent){
        showToast("Still waiting for Microsoft sign-in.");
      }
    }catch(e){
      if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
      const msg=e.message||String(e);
      if(/expired|declined|invalid connection session/i.test(msg)){
        local.connectSession=null;
        local.connectCode="";
        local.connectUri="";
        saveConnectState();
      }else{
        saveConnectState();
      }
      local.error=msg;
      renderNow();
    }finally{ local.busy=false; }
  }

  async function runScan(full){
    if(local.busy) return;
    local.busy=true; local.error="";
    local.notice=full?"Building the remittance library…":"Checking for new remittances…";
    renderNow();
    try{
      const result=await api("scan",{full:!!full});
      local.notice=result.message||"Remittance check complete.";
      local.loaded=false; await load(true);
    }catch(e){
      local.error=e.message||String(e); renderNow();
    }finally{ local.busy=false; }
  }

  async function addTarget(){
    const supplier=document.getElementById("remit-add-supplier")?.value.trim();
    const date=document.getElementById("remit-add-date")?.value;
    const raw=document.getElementById("remit-add-amount")?.value||"";
    const amount=Number(raw.replace(/[£,\s]/g,""));
    if(!supplier||!date||!Number.isFinite(amount)||amount<=0){ showToast("Enter supplier, date and amount.",true); return; }
    try{
      await rest("remittance_targets",{
        method:"POST",
        headers:Object.assign(await authHeaders(),{"Prefer":"return=minimal"}),
        body:[{supplier,payment_date:date,amount:number2(amount),status:"to_find",created_by:"tony@neautoservices.com",updated_at:new Date().toISOString()}]
      });
      local.notice="Added "+supplier+" "+money(amount)+" to the find list.";
      local.loaded=false; await load(true);
    }catch(e){ showToast(e.message||"Could not add payment.",true); }
  }

  function searchTarget(id){
    const t=targetById(id); if(!t) return;
    local.selectedTargetId=id;
    local.filter.date=t.payment_date||"";
    local.filter.amount=Number(t.amount).toFixed(2);
    local.filter.supplier=t.supplier||"";
    renderNow();
    setTimeout(()=>document.querySelector("[data-remit-filter='amount']")?.scrollIntoView({behavior:"smooth",block:"center"}),50);
  }

  async function matchDoc(docId){
    const t=targetById(local.selectedTargetId);
    if(!t){ showToast("Choose a payment to match first.",true); return; }
    try{
      await rest("remittance_targets?id=eq."+encodeURIComponent(t.id),{
        method:"PATCH",
        headers:Object.assign(await authHeaders(),{"Prefer":"return=minimal"}),
        body:{status:"found",matched_document_id:docId,updated_at:new Date().toISOString()}
      });
      local.notice="Matched "+t.supplier+" "+money(t.amount)+" to the selected PDF.";
      local.selectedTargetId=null; local.loaded=false; await load(true);
    }catch(e){ showToast(e.message||"Could not match PDF.",true); }
  }

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src===src);
      if(existing){
        if(window.Tesseract) return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      const s=document.createElement("script");
      s.src=src; s.async=true; s.crossOrigin="anonymous";
      s.onload=resolve; s.onerror=()=>reject(new Error("Screenshot reader could not load."));
      document.head.appendChild(s);
    });
  }
  async function ocrImage(file){
    if(!file||local.ocrBusy) return;
    local.ocrBusy=true; local.ocrMessage="Loading screenshot reader…"; renderNow();
    try{
      await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js");
      if(!window.Tesseract) throw new Error("Screenshot reader did not initialise.");
      local.ocrMessage="Reading numbers from the screenshot…"; renderNow();
      const worker=await window.Tesseract.createWorker("eng");
      const result=await worker.recognize(file);
      await worker.terminate();
      const values=parseValues(result?.data?.text||"");
      if(!values.length) throw new Error("No monetary values were recognised. Try a clearer crop of the AutoWork values.");
      local.autoValues=values.map(v=>v.toFixed(2)).join("\n");
      local.ocrMessage="Read "+values.length+" value"+(values.length===1?"":"s")+" from the screenshot. Check them, then press Find combinations.";
    }catch(e){
      local.ocrMessage=e.message||"Could not read screenshot.";
    }finally{
      local.ocrBusy=false; renderNow();
    }
  }

  document.addEventListener("click", async e=>{
    const el=e.target.closest("[data-remit-action]");
    if(!el) return;
    const action=el.dataset.remitAction;
    try{
      if(action==="connect") return await startConnection();
      if(action==="copy-code"){
        await navigator.clipboard.writeText(local.connectCode||"");
        return showToast("Microsoft code copied.");
      }
      if(action==="poll-connect") return await pollConnection(false);
      if(action==="scan") return await runScan(false);
      if(action==="full-scan") return await runScan(true);
      if(action==="open-pdf") return await openPdf(el.dataset.doc);
      if(action==="apply-search") return renderNow();
      if(action==="clear-search"){
        local.filter={date:"",amount:"",supplier:""}; local.selectedTargetId=null; return renderNow();
      }
      if(action==="search-target") return searchTarget(el.dataset.target);
      if(action==="match-doc") return await matchDoc(el.dataset.doc);
      if(action==="add-target") return await addTarget();
      if(action==="calculate-autowork"){ calculateAutoWork(); return renderNow(); }
      if(action==="clear-autowork"){
        local.autoPayment="";local.autoValues="";local.autoResults=[];local.autoGrossTarget=null;local.ocrMessage="";return renderNow();
      }
    }catch(err){
      console.error("Remittance action failed",err);
      showToast(err.message||"Remittance action failed.",true);
    }
  });

  document.addEventListener("input", e=>{
    const filter=e.target.closest("[data-remit-filter]");
    if(filter){
      local.filter[filter.dataset.remitFilter]=filter.value;
      return;
    }
    const auto=e.target.closest("[data-remit-auto]");
    if(auto){
      const k=auto.dataset.remitAuto;
      if(k==="supplier") local.autoSupplier=auto.value;
      if(k==="payment") local.autoPayment=auto.value;
      if(k==="values") local.autoValues=auto.value;
      local.autoResults=[]; local.autoGrossTarget=null;
    }
  });
  document.addEventListener("change", e=>{
    const filter=e.target.closest("[data-remit-filter]");
    if(filter){ local.filter[filter.dataset.remitFilter]=filter.value; renderNow(); return; }
    const auto=e.target.closest("[data-remit-auto]");
    if(auto){
      const k=auto.dataset.remitAuto;
      if(k==="supplier") local.autoSupplier=auto.value;
      if(k==="payment") local.autoPayment=auto.value;
      if(k==="values") local.autoValues=auto.value;
      local.autoResults=[]; local.autoGrossTarget=null; renderNow(); return;
    }
    if(e.target && e.target.id==="remit-autowork-image"){
      const file=e.target.files&&e.target.files[0];
      if(file) ocrImage(file);
    }
  });

  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden && local.connectSession){
      startPolling();
      setTimeout(()=>pollConnection(true),150);
    }
  });
  window.addEventListener("focus",()=>{
    if(local.connectSession) setTimeout(()=>pollConnection(true),150);
  });
  if(local.connectSession){
    startPolling();
    setTimeout(()=>pollConnection(true),500);
  }

  window.NEASRemittances = {
    render: renderPanel,
    refresh,
    load: ()=>load(true)
  };
})();