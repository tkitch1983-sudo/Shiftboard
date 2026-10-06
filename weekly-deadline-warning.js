(function(){
  'use strict';

  const STYLE_ID='weekly-deadline-warning-style';
  const APP_ATTR='app';
  const FULLSCREEN_ATTR='fullscreen';
  let observer=null;
  let timer=null;

  function londonNowParts(){
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/London',
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      weekday:'long',
      hour:'2-digit',
      minute:'2-digit',
      hourCycle:'h23'
    }).formatToParts(new Date());
    const map={};
    parts.forEach(function(p){if(p.type!=='literal')map[p.type]=p.value;});
    return {
      year:Number(map.year),
      month:Number(map.month),
      day:Number(map.day),
      weekday:String(map.weekday||''),
      hour:Number(map.hour),
      minute:Number(map.minute)
    };
  }

  function localDateUtc(parts){
    return new Date(Date.UTC(parts.year,parts.month-1,parts.day));
  }

  function addUtcDays(date,days){
    const d=new Date(date.getTime());
    d.setUTCDate(d.getUTCDate()+days);
    return d;
  }

  function fmtDate(date){
    return date.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'});
  }

  function deadlineInfo(){
    let p;
    try{p=londonNowParts();}catch(_e){
      const d=new Date();
      p={year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()],hour:d.getHours(),minute:d.getMinutes()};
    }

    const dayIndex={Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6}[p.weekday];
    if(dayIndex===undefined)return null;
    if(dayIndex!==5&&dayIndex!==6&&dayIndex!==0&&dayIndex!==1)return null;

    const localDate=localDateUtc(p);

    if(dayIndex===1){
      const weekStart=addUtcDays(localDate,-7);
      const beforeDeadline=p.hour<11;
      return {
        tone:beforeDeadline?'urgent':'overdue',
        title:beforeDeadline?'DUE BY 11:00 TODAY':'OVERDUE',
        text:beforeDeadline
          ? 'Last week\'s timesheets and weekly checks (week commencing '+fmtDate(weekStart)+') must be completed and checked before 11:00 today.'
          : 'Last week\'s timesheets and weekly checks (week commencing '+fmtDate(weekStart)+') should have been completed and checked by 11:00 today.'
      };
    }

    const diffToMonday=(dayIndex+6)%7;
    const weekStart=addUtcDays(localDate,-diffToMonday);
    const daysToNextMonday=(8-dayIndex)%7;
    const deadline=addUtcDays(localDate,daysToNextMonday||7);
    return {
      tone:'due',
      title:'WEEKLY DEADLINE',
      text:'All timesheets and weekly checks for the week commencing '+fmtDate(weekStart)+' must be completed and checked by 11:00 Monday '+fmtDate(deadline)+'.'
    };
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=
      '.weekly-deadline-banner{box-sizing:border-box;width:100%;margin:0 0 12px;padding:10px 14px;border:1px solid #c98a00;border-left:6px solid #c98a00;background:#2b2413;color:#fff7dc;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-family:Inter,Arial,sans-serif;line-height:1.35;}'
      +'.weekly-deadline-banner strong{font-size:13px;letter-spacing:.04em;}'
      +'.weekly-deadline-banner span{font-size:12px;color:#f5e8bd;}'
      +'.weekly-deadline-banner[data-tone="urgent"],.weekly-deadline-banner[data-tone="overdue"]{border-color:#cf4040;border-left-color:#cf4040;background:#351818;color:#fff0f0;}'
      +'.weekly-deadline-banner[data-tone="urgent"] span,.weekly-deadline-banner[data-tone="overdue"] span{color:#ffd7d7;}'
      +'#boardroom-shell .weekly-deadline-banner{margin-bottom:12px;border-radius:8px;}'
      +'@media(max-width:700px){.weekly-deadline-banner{padding:9px 10px;gap:5px;}.weekly-deadline-banner strong,.weekly-deadline-banner span{width:100%;}}';
    document.head.appendChild(style);
  }

  function bannerHtml(info){
    const esc=function(v){return String(v).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});};
    return '<strong>'+esc(info.title)+'</strong><span>'+esc(info.text)+'</span>';
  }

  function removeAll(){
    document.querySelectorAll('.weekly-deadline-banner').forEach(function(el){el.remove();});
  }

  function ensureAppBanner(info){
    const app=document.getElementById('app');
    if(!app)return;
    let el=app.querySelector(':scope > .weekly-deadline-banner[data-weekly-deadline="'+APP_ATTR+'"]');
    if(!el){
      el=document.createElement('div');
      el.className='weekly-deadline-banner no-print';
      el.setAttribute('data-weekly-deadline',APP_ATTR);
      app.insertBefore(el,app.firstChild);
    }
    el.dataset.tone=info.tone;
    el.innerHTML=bannerHtml(info);
  }

  function ensureFullscreenBanner(info){
    const fs=document.fullscreenElement;
    document.querySelectorAll('.weekly-deadline-banner[data-weekly-deadline="'+FULLSCREEN_ATTR+'"]').forEach(function(el){el.remove();});
    if(!fs)return;
    const stage=fs.querySelector&&fs.querySelector('.boardroom-stage');
    if(!stage)return;
    const el=document.createElement('div');
    el.className='weekly-deadline-banner no-print';
    el.setAttribute('data-weekly-deadline',FULLSCREEN_ATTR);
    el.dataset.tone=info.tone;
    el.innerHTML=bannerHtml(info);
    stage.insertBefore(el,stage.firstChild);
    try{
      if(typeof fitBoardroomToViewport==='function')setTimeout(function(){fitBoardroomToViewport(fs);},20);
    }catch(_e){}
  }

  function renderWarning(){
    ensureStyle();
    const info=deadlineInfo();
    if(!info){
      removeAll();
      return;
    }
    ensureAppBanner(info);
    ensureFullscreenBanner(info);
  }

  function start(){
    renderWarning();
    const app=document.getElementById('app');
    if(app){
      observer=new MutationObserver(function(){renderWarning();});
      observer.observe(app,{childList:true});
    }
    timer=setInterval(renderWarning,60000);
    document.addEventListener('fullscreenchange',function(){setTimeout(renderWarning,30);});
    document.addEventListener('visibilitychange',function(){if(!document.hidden)renderWarning();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  window.addEventListener('pagehide',function(){
    if(observer)observer.disconnect();
    if(timer)clearInterval(timer);
  });
})();