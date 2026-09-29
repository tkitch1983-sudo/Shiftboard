(function(){
'use strict';

const isTony=()=>{try{return typeof isTonyLogin==='function'&&isTonyLogin()}catch(_e){return false}};
const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0};
const valid=v=>String(v==null?'':v).trim()!==''&&Number.isFinite(Number(v));
const monthNow=()=>{try{return (state&&state.admin&&state.admin.bonusMonth)||new Date().toISOString().slice(0,7)}catch(_e){return new Date().toISOString().slice(0,7)}};
const order=['peterlee','middlesbrough','fairfield','chester','gateshead','seaham','hartlepool','lido'];
const C=(v,s=0)=>({v:v==null?'':v,s});
const H=v=>C(v,1), CUR=v=>C(num(v),2), TITLE=v=>C(v,3), B=v=>C(v,4);
const xesc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

function draftFor(month){try{return typeof bonusMonthData==='function'?bonusMonthData(month):null}catch(_e){return null}}
function captureVisible(month,d){
  if(!d)return;
  if(!d.employees)d.employees={};
  document.querySelectorAll('[data-bonus-emp][data-bonus-field]').forEach(input=>{
    const id=String(input.dataset.bonusEmp||''),field=String(input.dataset.bonusField||'');
    if(!id||!field)return;d.employees[id]=d.employees[id]||{};d.employees[id][field]=String(input.value||'').trim();
  });
  document.querySelectorAll('[data-bonus-role]').forEach(sel=>{
    try{const emp=state.config.employees.find(e=>String(e.id)===String(sel.dataset.bonusRole));if(emp)emp.bonusRole=sel.value}catch(_e){}
  });
  const set=(id,key)=>{const el=document.getElementById(id);if(el)d[key]=String(el.value||'').trim()};
  set('bonus-tony-adjustment','tonyAdjustment');set('bonus-neil-owed','neilOwed');set('bonus-tony-override','tonyOverride');set('bonus-neil-override','neilOverride');
  if(!d.sitePredictions||typeof d.sitePredictions!=='object')d.sitePredictions={};
  document.querySelectorAll('[data-bonus-prediction]').forEach(input=>{const k=String(input.dataset.bonusPrediction||''),raw=String(input.value||'').trim();if(!k)return;if(raw==='')delete d.sitePredictions[k];else if(Number.isFinite(Number(raw))&&Number(raw)>=0)d.sitePredictions[k]=raw});
  if(!d.floaterMLanglands||typeof d.floaterMLanglands!=='object')d.floaterMLanglands={sites:{},adjustment:'',note:''};
  if(!d.floaterMLanglands.sites)d.floaterMLanglands.sites={};
  document.querySelectorAll('[data-floater-amount]').forEach(input=>{const k=input.dataset.floaterAmount;d.floaterMLanglands.sites[k]=d.floaterMLanglands.sites[k]||{};d.floaterMLanglands.sites[k].amount=String(input.value||'').trim()});
  document.querySelectorAll('[data-floater-note]').forEach(input=>{const k=input.dataset.floaterNote;d.floaterMLanglands.sites[k]=d.floaterMLanglands.sites[k]||{};d.floaterMLanglands.sites[k].note=String(input.value||'').trim()});
  const fa=document.getElementById('floater-adjustment'),fn=document.getElementById('floater-month-note');
  if(fa)d.floaterMLanglands.adjustment=String(fa.value||'').trim();if(fn)d.floaterMLanglands.note=String(fn.value||'').trim();
}

function buildData(){
  const month=monthNow(),d=draftFor(month)||{};captureVisible(month,d);
  let snaps={};try{snaps=bonusSnapshotsForMonth(month)||{}}catch(_e){}
  const predicting=month===new Date().toISOString().slice(0,7)&&!!(state&&state.admin&&state.admin.bonusPredictMode);
  if(predicting){Object.keys(snaps).forEach(k=>{try{snaps[k]=bonusProjectSnapshot(snaps[k],month)}catch(_e){}})}
  const siteData={},allStaff=[];let staffTotal=0,totalSales=0,totalDavanti=0;
  order.forEach(key=>{
    const rule=BONUS_SITE_RULES[key];if(!rule)return;
    const snap=snaps[key]||{},sales=bonusAmount(snap.total_current),units=bonusAmount(snap.davanti),addOnBonus=bonusAddOn(snap);
    const calc={siteKey:key,sales,staffBonus:rule.staffStart==null?0:bonusTier(sales,rule.staffStart,rule.staffBase),davantiBonus:rule.davantiTarget==null?0:bonusDavanti(units,rule.davantiTarget),addOnBonus};
    if(rule.groupActive!==false){totalSales+=sales;totalDavanti+=units}
    const site=state.config.sites.find(s=>bonusSiteKey(s.name)===key);
    const employees=site?state.config.employees.filter(e=>String(e.siteId)===String(site.id)&&e.active!==false):[];
    const receptionCount=employees.filter(e=>bonusRole(e)==='reception').length;
    const rows=employees.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))).map(emp=>{
      const edit=d.employees&&d.employees[emp.id]||{},r=bonusEmployeeCalc(emp,calc,month,d,receptionCount);
      const row={site:rule.label,name:emp.name,role:r.role,base:r.base,davanti:r.davanti,addOn:r.addOn,managerExtra:r.managerExtra,sickDays:r.sickDays,sickDeduction:r.sickDeduction,damages:r.damages,owed:r.owed,extra:r.extra,baseOverride:edit.baseOverride||'',total:r.total};
      staffTotal+=r.total;allStaff.push(row);return row;
    });
    siteData[key]={label:rule.label,sales,units,staffBonus:calc.staffBonus,davantiBonus:calc.davantiBonus,addOnBonus,receptionCount,prediction:d.sitePredictions&&d.sitePredictions[key]||'',rows};
  });
  let tonySales=0,tonySalesBonus=0;
  Object.entries(BONUS_SITE_RULES).forEach(([key,rule])=>{if(rule.tonyStart==null)return;const value=bonusAmount(snaps[key]&&snaps[key].total_current);tonySales+=value;tonySalesBonus+=bonusTier(value,rule.tonyStart,rule.tonyBase)});
  const tonyDavanti=bonusTonyDavanti(Object.entries(snaps).filter(([key])=>key!=='gateshead').reduce((n,[,r])=>n+bonusAmount(r&&r.davanti),0));
  const tonyAdjustment=bonusAmount(d.tonyAdjustment),tonyCalculated=tonySalesBonus+tonyDavanti+tonyAdjustment,tonyFinal=valid(d.tonyOverride)?Number(d.tonyOverride):tonyCalculated;
  const neilTurnover=bonusNeilTurnover(totalSales),neilDavanti=bonusNeilDavanti(totalDavanti),neilOwed=bonusAmount(d.neilOwed),neilCalculated=neilTurnover+neilDavanti+neilOwed,neilFinal=valid(d.neilOverride)?Number(d.neilOverride):neilCalculated;
  const fl=d.floaterMLanglands||{sites:{},adjustment:'',note:''};let floaterTotal=num(fl.adjustment);order.forEach(k=>{floaterTotal+=num(fl.sites&&fl.sites[k]&&fl.sites[k].amount)});
  return {month,d,siteData,allStaff,staffTotal,totalSales,totalDavanti,tony:{sales:tonySales,salesBonus:tonySalesBonus,davanti:tonyDavanti,adjustment:tonyAdjustment,calculated:tonyCalculated,override:d.tonyOverride||'',final:tonyFinal},neil:{sales:totalSales,turnover:neilTurnover,davantiUnits:totalDavanti,davanti:neilDavanti,owed:neilOwed,calculated:neilCalculated,override:d.neilOverride||'',final:neilFinal},floater:fl,floaterTotal};
}

function summaryRows(x){
 const monthLabel=new Date(x.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 return [[TITLE('NEAS Monthly Bonus Workbook')],[B(monthLabel)],[],[H('Category'),H('Calculated'),H('Override / adjustment'),H('Final')],[B('Tony'),CUR(x.tony.calculated),C(x.tony.override||''),CUR(x.tony.final)],[B('Neil'),CUR(x.neil.calculated),C(x.neil.override||''),CUR(x.neil.final)],[B('M Langlands — Floater'),CUR(x.floaterTotal),C(x.floater.adjustment||''),CUR(x.floaterTotal)],[B('All site staff'),CUR(x.staffTotal),'',CUR(x.staffTotal)],[B('Grand total'),'','',CUR(x.staffTotal+x.tony.final+x.neil.final+x.floaterTotal)],[],[H('Site'),H('Sales used'),H('Prediction entered'),H('Staff tier'),H('Davanti units'),H('Davanti each'),H('Add-on pot')],...order.filter(k=>x.siteData[k]).map(k=>{const s=x.siteData[k];return [s.label,CUR(s.sales),s.prediction?CUR(s.prediction):'',CUR(s.staffBonus),s.units,CUR(s.davantiBonus),CUR(s.addOnBonus)]})];
}
function personalRows(title,items){return [[TITLE(title)],[B(new Date(items.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}))],[],[H('Item'),H('Value')],...items.rows]}
function staffSheetRows(title,site){
 const rows=[[TITLE(title)],[B('Sales used'),CUR(site.sales),B('Prediction'),site.prediction?CUR(site.prediction):''],[B('Staff tier'),CUR(site.staffBonus),B('Davanti'),site.units,B('Davanti each'),CUR(site.davantiBonus)],[B('Add-on pot'),CUR(site.addOnBonus),B('Reception count'),site.receptionCount],[],[H('Employee'),H('Role'),H('Base'),H('Davanti'),H('Add-on share'),H('Manager extra'),H('Sick days'),H('Sick deduction'),H('Damages'),H('Owed'),H('Manual extra'),H('Base override'),H('Total')]];
 site.rows.forEach(r=>rows.push([r.name,r.role,CUR(r.base),CUR(r.davanti),CUR(r.addOn),CUR(r.managerExtra),r.sickDays,CUR(r.sickDeduction),CUR(r.damages),CUR(r.owed),CUR(r.extra),r.baseOverride===''?'':CUR(r.baseOverride),CUR(r.total)]));return rows;
}
function workbookSheets(x){
 const sheets=[{name:'Summary',rows:summaryRows(x)}];
 sheets.push({name:'Tony',rows:personalRows('Tony Bonus',{month:x.month,rows:[[B('Eligible sales'),CUR(x.tony.sales)],[B('Sales bonus'),CUR(x.tony.salesBonus)],[B('Davanti bonus'),CUR(x.tony.davanti)],[B('Manual adjustment'),CUR(x.tony.adjustment)],[B('Calculated total'),CUR(x.tony.calculated)],[B('Final override'),x.tony.override===''?'':CUR(x.tony.override)],[B('Final bonus'),CUR(x.tony.final)]]})});
 sheets.push({name:'Neil',rows:personalRows('Neil Bonus',{month:x.month,rows:[[B('Group sales'),CUR(x.neil.sales)],[B('Turnover bonus'),CUR(x.neil.turnover)],[B('Group Davanti units'),x.neil.davantiUnits],[B('Davanti bonus'),CUR(x.neil.davanti)],[B('Owed / adjustment'),CUR(x.neil.owed)],[B('Calculated total'),CUR(x.neil.calculated)],[B('Final override'),x.neil.override===''?'':CUR(x.neil.override)],[B('Final bonus'),CUR(x.neil.final)]]})});
 const fr=[[TITLE('M Langlands — Floater Bonus')],[B(new Date(x.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}))],[],[H('Site'),H('Bonus amount'),H('Notes')]];
 order.forEach(k=>{const item=x.floater.sites&&x.floater.sites[k]||{};fr.push([x.siteData[k]?x.siteData[k].label:k,CUR(item.amount),item.note||''])});fr.push([], [B('Final adjustment / other'),CUR(x.floater.adjustment)], [B('Total floater bonus'),CUR(x.floaterTotal)], [B('Month notes'),x.floater.note||'']);sheets.push({name:'M Langlands',rows:fr});
 const all=[[TITLE('All Staff Bonus')],[B(new Date(x.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}))],[],[H('Site'),H('Employee'),H('Role'),H('Base'),H('Davanti'),H('Add-on share'),H('Manager extra'),H('Sick days'),H('Sick deduction'),H('Damages'),H('Owed'),H('Manual extra'),H('Base override'),H('Total')]];
 x.allStaff.forEach(r=>all.push([r.site,r.name,r.role,CUR(r.base),CUR(r.davanti),CUR(r.addOn),CUR(r.managerExtra),r.sickDays,CUR(r.sickDeduction),CUR(r.damages),CUR(r.owed),CUR(r.extra),r.baseOverride===''?'':CUR(r.baseOverride),CUR(r.total)]));all.push([], [B('Staff total'),CUR(x.staffTotal)]);sheets.push({name:'All Staff',rows:all});
 order.forEach(k=>{if(x.siteData[k])sheets.push({name:x.siteData[k].label,rows:staffSheetRows(x.siteData[k].label+' Bonus',x.siteData[k])})});return sheets;
}

function colName(n){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function cellXml(cell,r,c){cell=cell&&typeof cell==='object'&&Object.prototype.hasOwnProperty.call(cell,'v')?cell:C(cell);const ref=colName(c)+r,s=cell.s?` s="${cell.s}"`:'';if(typeof cell.v==='number'&&Number.isFinite(cell.v))return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xesc(cell.v)}</t></is></c>`}
function sheetXml(rows){
 let max=1;rows.forEach(r=>{max=Math.max(max,r.length)});const widths=[];for(let c=0;c<max;c++){let w=10;rows.forEach(r=>{const v=r[c]&&typeof r[c]==='object'&&Object.prototype.hasOwnProperty.call(r[c],'v')?r[c].v:r[c];w=Math.max(w,Math.min(42,String(v==null?'':v).length+2))});widths.push(w)}
 const cols=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
 const data=rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>cellXml(v,i+1,j+1)).join('')}</row>`).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
function stylesXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="£#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`}

const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function u16(v){const a=new Uint8Array(2);new DataView(a.buffer).setUint16(0,v,true);return a}function u32(v){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v>>>0,true);return a}
function concat(parts){let n=0;parts.forEach(p=>n+=p.length);const out=new Uint8Array(n);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length});return out}
function zip(files){
 const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;const now=new Date(),time=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xffff,date=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xffff;
 files.forEach(f=>{const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length});
 const cd=concat(centrals),body=concat(locals),end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(body.length),u16(0)]);return concat([body,cd,end]);
}
function xlsxBlob(sheets){
 const files=[],sheetRels=[];sheets.forEach((s,i)=>{files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(s.rows)});sheetRels.push(`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`)});
 const wbSheets=sheets.map((s,i)=>`<sheet name="${xesc(String(s.name).replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||('Sheet '+(i+1)))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
 files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`});
 files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`});
 files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`});
 files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels.join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
 files.push({name:'xl/styles.xml',data:stylesXml()});const iso=new Date().toISOString();
 files.push({name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Shiftboard</dc:creator><cp:lastModifiedBy>Shiftboard</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`});
 files.push({name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Shiftboard</Application></Properties>`});
 return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function downloadWorkbook(){
 try{const x=buildData(),blob=xlsxBlob(workbookSheets(x)),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='shiftboard-bonus-'+x.month+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);try{if(typeof showToast==='function')showToast('Excel bonus workbook downloaded.')}catch(_e){}}catch(err){console.error(err);try{if(typeof showToast==='function')showToast('Excel export could not be created.',true)}catch(_e){}}
}
function addButton(html){
 if(!isTony()||typeof html!=='string'||html.includes('data-action="bonus-excel-export"'))return html;const marker='data-bonus-view="floater"',at=html.indexOf(marker);if(at<0)return html;const end=html.indexOf('</button>',at);if(end<0)return html;return html.slice(0,end+9)+'<button type="button" class="add-btn secondary" data-action="bonus-excel-export" style="padding:8px 12px;margin-left:8px;">Export all to Excel</button>'+html.slice(end+9);
}
try{if(typeof renderAdminBonus==='function'){const previous=renderAdminBonus;renderAdminBonus=function(){return addButton(previous.apply(this,arguments))};try{window.renderAdminBonus=renderAdminBonus}catch(_e){}}}catch(_e){}
document.addEventListener('click',e=>{if(!isTony())return;const b=e.target&&e.target.closest?e.target.closest('[data-action="bonus-excel-export"]'):null;if(!b)return;e.preventDefault();e.stopImmediatePropagation();downloadWorkbook()},true);
})();
