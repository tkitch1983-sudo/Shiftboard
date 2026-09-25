(function(){
  'use strict';
  try{
    if(typeof renderAdmin!=='function') return;
    const previous=renderAdmin;
    renderAdmin=function(){
      const html=previous();
      if(!state.admin || state.admin.tab!=='weeklychecks' || state.admin.role!=='super') return html;
      const wrap=document.createElement('div');
      wrap.innerHTML=html;
      const main=wrap.querySelector('.admin-main');
      if(!main) return html;
      const heading=Array.from(main.querySelectorAll('h3')).find(function(h){return h.textContent.trim()==='Workshop weekly status';});
      if(!heading) return wrap.innerHTML;
      const card=heading.closest('.card');
      if(!card) return wrap.innerHTML;
      const rows=Array.from(card.querySelectorAll('tbody tr'));
      const done=rows.filter(function(tr){return !!tr.querySelector('.pill-approved');}).length;
      const counter=Array.from(card.querySelectorAll('div')).find(function(d){return /\d+\s+of\s+\d+\s+(?:workshops\s+)?completed/i.test(d.textContent||'');});
      if(counter) counter.innerHTML='<b>'+done+'</b> of <b>'+rows.length+'</b> workshops completed';
      return wrap.innerHTML;
    };
  }catch(err){console.error('Weekly checks counter fix failed:',err);}
})();
