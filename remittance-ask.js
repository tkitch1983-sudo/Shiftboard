(() => {
  "use strict";

  function findCard(){
    return [...document.querySelectorAll(".card")].find(x =>
      /Remittances to find/i.test(x.textContent || "")
    ) || null;
  }

  function outstanding(card){
    return [...card.querySelectorAll("tbody tr")].map(row => {
      const c=row.querySelectorAll("td");
      if(c.length<5) return null;
      const status=(c[0].textContent||"").trim().toUpperCase();
      if(status!=="TO FIND" && status!=="REVIEW") return null;
      return {
        supplier:(c[1].querySelector("b")?.textContent||"Unknown").trim(),
        date:(c[2].textContent||"").trim(),
        amount:(c[3].textContent||"").trim()
      };
    }).filter(Boolean);
  }

  function buildPrompt(items){
    return [
      "I am in Shift Board > Tony > Remittances. Please investigate these missing remittances using my connected Outlook mailboxes, using the same method we established previously.",
      "",
      "Important matching rules:",
      "- The date shown is the bank date, so the remittance/payment date may be earlier by several days.",
      "- Pennies can differ slightly, so check close-value matches as well as exact amounts.",
      "- Use the supplier rules we established, including Arval fee/VAT calculations where relevant.",
      "- Search the connected mailboxes for likely remittance emails and PDFs.",
      "- Give me the strongest match for each payment and do not call a near-match confirmed unless the evidence supports it.",
      "",
      "Outstanding Shift Board payments:",
      ...items.map(x => "- "+x.supplier+" "+x.amount+" — bank date "+x.date)
    ].join("\n");
  }

  function prepare(){
    const card=findCard();
    if(!card) return;
    const items=outstanding(card);
    if(!items.length){
      if(typeof window.showToast==="function") window.showToast("There are no missing remittances to ask about.");
      return;
    }

    let panel=card.querySelector("[data-remit-ask-panel]");
    if(panel) panel.remove();

    panel=document.createElement("div");
    panel.dataset.remitAskPanel="1";
    panel.style.cssText="margin:12px 0;padding:12px;border:1px solid var(--line-soft);border-radius:10px;background:var(--panel-2);";
    panel.innerHTML=
      '<b>Ready for ChatGPT</b>'
      +'<div style="font-size:11px;color:var(--muted);margin:4px 0 9px;">'+items.length+' outstanding payment'+(items.length===1?'':'s')+' prepared. Copy the request, open ChatGPT, then paste it.</div>'
      +'<textarea data-remit-ask-text rows="8" readonly style="width:100%;font-size:12px;"></textarea>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;">'
      +'<button type="button" class="btn-sm approve" data-remit-copy>Copy request</button>'
      +'<a class="btn-sm" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Open ChatGPT</a>'
      +'<button type="button" class="btn-sm" data-remit-close-ask>Close</button>'
      +'</div>';
    card.insertBefore(panel,card.querySelector(".form-row")||card.firstChild);
    panel.querySelector("[data-remit-ask-text]").value=buildPrompt(items);

    panel.querySelector("[data-remit-copy]").addEventListener("click",async()=>{
      const text=panel.querySelector("[data-remit-ask-text]").value;
      try{
        await navigator.clipboard.writeText(text);
        if(typeof window.showToast==="function") window.showToast("Request copied. Open ChatGPT and paste it.");
      }catch(_e){
        const ta=panel.querySelector("[data-remit-ask-text]");
        ta.focus(); ta.select();
      }
    });
    panel.querySelector("[data-remit-close-ask]").addEventListener("click",()=>panel.remove());
  }

  function install(){
    const card=findCard();
    if(!card || card.querySelector("[data-remit-ask]")) return;
    const title=[...card.querySelectorAll("b")].find(x=>/Remittances to find/i.test(x.textContent||""));
    const header=title?.parentElement?.parentElement;
    const controls=header?.querySelector("div:last-child");
    if(!controls) return;

    const button=document.createElement("button");
    button.type="button";
    button.className="btn-sm approve";
    button.dataset.remitAsk="1";
    button.textContent="Ask";
    button.addEventListener("click",prepare);
    controls.prepend(button);
  }

  new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",install);
  install();
})();