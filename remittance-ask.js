(() => {
  "use strict";
  function install(){
    const cards=[...document.querySelectorAll(".card")];
    const card=cards.find(x=>/Remittances to find/i.test(x.textContent||""));
    if(!card || card.querySelector("[data-remit-ask]")) return;
    const title=[...card.querySelectorAll("b")].find(x=>/Remittances to find/i.test(x.textContent||""));
    const header=title?.parentElement?.parentElement;
    const controls=header?.querySelector("div:last-child");
    if(!controls) return;
    const a=document.createElement("a");
    a.className="btn-sm approve";
    a.dataset.remitAsk="1";
    a.href="https://chatgpt.com/";
    a.target="_blank";
    a.rel="noopener noreferrer";
    a.textContent="Ask";
    controls.prepend(a);
  }
  new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",install);
  install();
})();