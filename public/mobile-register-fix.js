(function(){
'use strict';

function siteList(){return (state&&state.config&&Array.isArray(state.config.sites))?state.config.sites:[];}
function employeeList(){return (state&&state.config&&Array.isArray(state.config.employees))?state.config.employees:[];}
function siteById(id){return siteList().find(s=>String(s.id)===String(id))||null;}
function employeeByAnyId(id){return employeeList().find(e=>String(e.id)===String(id))||null;}
function norm(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');}
function etacKind(siteId){
  const n=norm(siteById(siteId)?.name);
  if(!n.includes('etac')) return '';
  if(n.includes('workshop')) return 'workshop';
  if(n.includes('filling')||n.includes('petrol')||n.includes('station')) return 'filling';
  return '';
}
function etacEquivalent(a,b){
  if(!a||!b||String(a)===String(b)) return String(a)===String(b);
  const x=etacKind(a),y=etacKind(b);
  return !!x&&!!y&&x!==y;
}

// Safari/iPhone can still paint part of the 1100px print-only sheet when it is
// merely positioned far off-screen. Keep it completely out of normal layout.
const style=document.createElement('style');
style.textContent='\n.mot-print-source{display:none!important;}\n@media(max-width:760px){.admin-main{min-width:0!important;}.mot-print-source{display:none!important;}}\n';
(document.head||document.documentElement).appendChild(style);

function installRegisterFix(){
  try{
    // For Register purposes ETAC Filling Station and ETAC Workshop are the same
    // building. Keep the employee under their home site even when they used the
    // other ETAC clock-in point.
    if(typeof currentSiteId==='function'&&!currentSiteId.__etacSameBuilding){
      const base=currentSiteId;
      const wrapped=function(empId){
        const actual=base(empId),emp=(typeof employeeById==='function'?employeeById(empId):employeeByAnyId(empId));
        if(emp&&etacEquivalent(emp.siteId,actual)) return emp.siteId;
        return actual;
      };
      wrapped.__etacSameBuilding=true;
      currentSiteId=wrapped;
    }

    if(typeof renderAdminRegister==='function'&&!renderAdminRegister.__siteSections){
      const baseRegister=renderAdminRegister;
      const wrappedRegister=function(){
        const html=baseRegister();
        try{
          if(!state||!state.admin||state.admin.role!=='super'||String(state.admin.regSite||'all')!=='all') return html;
          const box=document.createElement('div');box.innerHTML=html;
          const table=Array.from(box.querySelectorAll('table')).find(t=>{
            const h=String(t.querySelector('thead')?.textContent||'').toLowerCase();
            return h.includes('employee')&&h.includes('site')&&h.includes('status')&&h.includes('signed in');
          });
          const tbody=table&&table.querySelector('tbody');if(!tbody)return html;
          const emps=employeeList();
          const empMap=new Map(emps.map(e=>[String(e.id),e]));
          const nameMap=new Map();emps.forEach(e=>{const k=String(e.name||'').trim().toLowerCase();if(k&&!nameMap.has(k))nameMap.set(k,e);});
          const grouped=new Map();
          Array.from(tbody.children).forEach(row=>{
            if(row.querySelector('td[colspan]')) return;
            let id=String(row.querySelector('[data-id]')?.getAttribute('data-id')||'');
            let emp=id?empMap.get(id):null;
            if(!emp){const name=String(row.children[0]?.textContent||'').trim().toLowerCase();emp=nameMap.get(name)||null;}
            if(!emp)return;
            const key=String(emp.siteId||'other');
            if(!grouped.has(key))grouped.set(key,[]);
            grouped.get(key).push(row.cloneNode(true));
          });
          if(!grouped.size)return html;
          tbody.innerHTML='';
          const ordered=siteList().map(s=>String(s.id)).filter(id=>grouped.has(id));
          Array.from(grouped.keys()).forEach(id=>{if(!ordered.includes(id))ordered.push(id);});
          ordered.forEach(id=>{
            const members=grouped.get(id)||[];if(!members.length)return;
            const site=siteById(id);const label=site?.name||'Other';
            const head=document.createElement('tr');
            head.setAttribute('data-register-site-section',id);
            head.innerHTML='<td colspan="5" style="background:var(--panel-2);color:var(--amber);font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:600;letter-spacing:.02em;padding:10px 12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);">'+String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+' <span style="color:var(--muted-2);font-family:\'IBM Plex Mono\',monospace;font-size:11px;font-weight:400;">'+members.length+'</span></td>';
            tbody.appendChild(head);members.forEach(r=>tbody.appendChild(r));
          });
          return box.innerHTML;
        }catch(err){console.error('Register site grouping failed',err);return html;}
      };
      wrappedRegister.__siteSections=true;
      renderAdminRegister=wrappedRegister;
    }

    if(state&&state.view==='admin'&&state.admin&&state.admin.authed&&state.admin.tab==='register'&&typeof render==='function') render();
  }catch(err){console.error('Mobile/register fix setup failed',err);}
}
setTimeout(installRegisterFix,0);
})();
