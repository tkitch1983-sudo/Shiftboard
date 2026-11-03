(() => {
  "use strict";

  let busy=false;

  function findCard(){
    return [...document.querySelectorAll(".card")].find(card =>
      /Remittances to find/i.test(card.textContent || "")
    ) || null;
  }

  function foundRows(card){
    return [...card.querySelectorAll("tbody tr")].map(row => {
      const cells=row.querySelectorAll("td");
      if(cells.length<5) return null;
      const status=(cells[0].textContent||"").trim().toUpperCase();
      if(status!=="FOUND") return null;
      const open=row.querySelector('[data-remit-action="open-pdf"][data-doc]');
      if(!open) return null;
      return {
        documentId:open.dataset.doc,
        supplier:(cells[1].querySelector("b")?.textContent||"Remittance").trim(),
        bankDate:(cells[2].textContent||"").trim(),
        amount:(cells[3].textContent||"").trim()
      };
    }).filter(Boolean);
  }

  function uniqueFound(card){
    const seen=new Set();
    return foundRows(card).filter(item=>{
      if(!item.documentId || seen.has(item.documentId)) return false;
      seen.add(item.documentId);
      return true;
    });
  }

  async function loadPdfLib(){
    if(window.PDFLib?.PDFDocument) return;
    await new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>/pdf-lib@1\.17\.1/.test(s.src||""));
      if(existing){
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
      s.async=true;
      s.crossOrigin="anonymous";
      s.onload=resolve;
      s.onerror=()=>reject(new Error("PDF print pack could not load."));
      document.head.appendChild(s);
    });
    if(!window.PDFLib?.PDFDocument) throw new Error("PDF print pack did not initialise.");
  }

  async function getPdfUrl(documentId){
    if(typeof authHeaders!=="function" || typeof SUPABASE_URL==="undefined" || !SUPABASE_URL) throw new Error("Shift Board sign-in is not available.");
    const res=await fetch(SUPABASE_URL+"/functions/v1/shiftboard-remittances",{
      method:"POST",
      headers:await authHeaders(),
      body:JSON.stringify({action:"pdf_url",document_id:documentId}),
      cache:"no-store"
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.url) throw new Error(data.error||"Could not open a matched remittance PDF.");
    return data.url;
  }

  function setStatus(card,message){
    let el=card.querySelector("[data-remit-print-status]");
    if(!el){
      el=document.createElement("div");
      el.dataset.remitPrintStatus="1";
      el.style.cssText="font-size:11px;color:var(--muted);margin:8px 0;";
      const header=[...card.children].find(x=>x.querySelector?.("b") && /Remittances to find/i.test(x.textContent||""));
      (header||card).insertAdjacentElement("afterend",el);
    }
    el.textContent=message||"";
  }

  async function printFound(){
    if(busy) return;
    const card=findCard();
    if(!card) return;
    const items=uniqueFound(card);
    if(!items.length){
      if(typeof window.showToast==="function") window.showToast("There are no found remittances to print.");
      return;
    }

    const printWindow=window.open("about:blank","_blank");
    if(printWindow){
      try{
        printWindow.document.title="Preparing remittance print pack";
        printWindow.document.body.innerHTML="<p style='font-family:Arial,sans-serif;padding:24px'>Preparing "+items.length+" found remittance PDF"+(items.length===1?"":"s")+"…</p>";
      }catch(_e){}
    }

    busy=true;
    const button=card.querySelector("[data-remit-print-found]");
    if(button) button.disabled=true;
    setStatus(card,"Preparing "+items.length+" found remittance PDF"+(items.length===1?"":"s")+"…");

    try{
      await loadPdfLib();
      const merged=await window.PDFLib.PDFDocument.create();
      let added=0, skipped=0;

      for(let i=0;i<items.length;i++){
        const item=items[i];
        setStatus(card,"Preparing print pack: "+(i+1)+" of "+items.length+" · "+item.supplier+" "+item.amount);
        try{
          const url=await getPdfUrl(item.documentId);
          const response=await fetch(url,{cache:"no-store"});
          if(!response.ok) throw new Error("PDF download failed");
          const bytes=await response.arrayBuffer();
          const source=await window.PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});
          const pages=await merged.copyPages(source,source.getPageIndices());
          pages.forEach(page=>merged.addPage(page));
          added++;
        }catch(err){
          console.warn("Skipped remittance in print pack",item.documentId,err);
          skipped++;
        }
      }

      if(!added) throw new Error("None of the found PDFs could be prepared for printing.");

      const bytes=await merged.save();
      const blob=new Blob([bytes],{type:"application/pdf"});
      const blobUrl=URL.createObjectURL(blob);
      const msg="Print pack ready: "+added+" remittance"+(added===1?"":"s")+(skipped?" · "+skipped+" skipped":"")+".";
      setStatus(card,msg+" Use the print button in the PDF viewer.");
      if(typeof window.showToast==="function") window.showToast(msg);

      if(printWindow){
        printWindow.location.replace(blobUrl);
      }else{
        const a=document.createElement("a");
        a.href=blobUrl;
        a.target="_blank";
        a.rel="noopener noreferrer";
        a.textContent="Open combined remittance print pack";
        a.className="btn-sm approve";
        a.style.display="inline-block";
        const status=card.querySelector("[data-remit-print-status]");
        status?.append(" ");
        status?.appendChild(a);
      }

      setTimeout(()=>URL.revokeObjectURL(blobUrl),10*60*1000);
    }catch(err){
      if(printWindow) try{printWindow.close();}catch(_e){}
      setStatus(card,err.message||"Could not prepare the found remittances for printing.");
      if(typeof window.showToast==="function") window.showToast(err.message||"Could not prepare print pack.",true);
    }finally{
      busy=false;
      if(button) button.disabled=false;
    }
  }

  function install(){
    const card=findCard();
    if(!card || card.querySelector("[data-remit-print-found]")) return;
    const title=[...card.querySelectorAll("b")].find(el=>/Remittances to find/i.test(el.textContent||""));
    const header=title?.parentElement?.parentElement;
    const controls=header?.querySelector("div:last-child");
    if(!controls) return;

    const found=[...card.querySelectorAll("tbody tr")].filter(row=>
      (row.querySelector("td")?.textContent||"").trim().toUpperCase()==="FOUND"
    ).length;
    if(!found) return;

    const button=document.createElement("button");
    button.type="button";
    button.className="btn-sm approve";
    button.dataset.remitPrintFound="1";
    button.textContent="Print found";
    button.addEventListener("click",printFound);
    controls.prepend(button);
  }

  new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",install);
  install();
})();