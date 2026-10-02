(function(){
  'use strict';

  const STYLE_ID='neas-page-info-style';
  let timer=null;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .neas-page-info{margin:34px 0 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);}
      .neas-page-info>summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:700;color:var(--text);user-select:none;}
      .neas-page-info>summary::-webkit-details-marker{display:none;}
      .neas-page-info>summary:after{content:'⌄';font-size:20px;line-height:1;color:var(--muted);transform-origin:center;transition:transform .15s ease;}
      .neas-page-info[open]>summary:after{transform:rotate(180deg);}
      .neas-page-info-icon{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;border:1px solid var(--muted);border-radius:50%;font-size:14px;margin-right:8px;color:var(--muted);}
      .neas-page-info-body{border-top:1px solid var(--line);padding:14px 16px;color:var(--muted);font-size:12px;line-height:1.55;}
      .neas-page-info-section+.neas-page-info-section{border-top:1px solid var(--line-soft);margin-top:12px;padding-top:12px;}
      .neas-page-info-section b{display:block;color:var(--text);font-size:12px;margin-bottom:4px;}
      @media(max-width:760px){
        .neas-page-info{margin-top:26px;}
        .neas-page-info>summary{padding:13px 14px;}
        .neas-page-info-body{padding:13px 14px;}
      }
      @media print{.neas-page-info{display:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function headingFor(el){
    let node=el.previousElementSibling;
    while(node){
      if(/^H[1-4]$/.test(node.tagName)) return String(node.textContent||'').trim();
      if(node.classList&&node.classList.contains('card')) break;
      node=node.previousElementSibling;
    }
    const parent=el.parentElement;
    if(parent && parent!==document.querySelector('.admin-main')){
      const h=parent.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4');
      if(h) return String(h.textContent||'').trim();
    }
    return '';
  }

  function decorate(){
    ensureStyle();
    const main=document.querySelector('.admin-main');
    if(!main) return;

    const existing=main.querySelector(':scope > .neas-page-info');
    const helpBlocks=Array.from(main.querySelectorAll('.head-sub')).filter(function(el){
      if(el.closest('.card,.modal,.modal-overlay,.neas-page-info')) return false;
      return el.closest('.admin-main')===main;
    });
    if(!helpBlocks.length) return;

    if(existing) existing.remove();

    const details=document.createElement('details');
    details.className='neas-page-info no-print';
    details.innerHTML='<summary><span><span class="neas-page-info-icon">i</span>Information</span></summary><div class="neas-page-info-body"></div>';
    const body=details.querySelector('.neas-page-info-body');

    helpBlocks.forEach(function(el){
      const section=document.createElement('div');
      section.className='neas-page-info-section';
      const heading=headingFor(el);
      if(heading){
        const title=document.createElement('b');
        title.textContent=heading;
        section.appendChild(title);
      }
      const copy=document.createElement('div');
      copy.innerHTML=el.innerHTML;
      section.appendChild(copy);
      body.appendChild(section);
      el.remove();
    });

    main.appendChild(details);
  }

  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(decorate,40);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',schedule);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule();});
  setTimeout(decorate,100);
})();