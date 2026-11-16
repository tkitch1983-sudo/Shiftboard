import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages=['index.html','public/index.html'];
const sites={
  'Seaham':'northeastseaham.motasoftvgm.co.uk/Default.aspx',
  'Middlesbrough':'tyreandautocentremiddlesbrough.motasoftvgm.co.uk/Default.aspx',
  'Fairfield':'fairfieldgarage.motasoftvgm.co.uk/Default.aspx',
  'Gateshead':'negaragesgateshead.motasoftvgm.co.uk/Default.aspx',
  'Peterlee':'easingtontyreandautocentre.motasoftvgm.co.uk/Default.aspx',
  'Chester-le-Street':'northeastgarageschesterlestreet.motasoftvgm.co.uk/Default.aspx',
  'Hartlepool':'northeasthartlepool.motasoftvgm.co.uk/Default.aspx',
  'Lido':'northeastlido.motasoftvgm.co.uk/'
};

for(const page of pages){
  test(page+' has all eight Motasoft URLs and the Peterlee/Easington map',()=>{
    const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
    for(const [name,host] of Object.entries(sites)){
      assert.ok(html.includes(host),name+' must exist in '+page);
    }
    assert.ok(html.includes("['Peterlee (Easington Motasoft)',"),'Peterlee mapping must be displayed');
  });
  test(page+' gates workdiaries by authenticated super role before generic grants',()=>{
    const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
    assert.match(html,/function canAccessAdminTab\(tab\)\s*\{[\s\S]{0,350}if\(tab==='workdiaries'\) return !!_session && _session\.role==='super' && state\.admin\.role==='super';/);
    assert.match(html,/function renderAdminWorkDiaries\(\)\s*\{[\s\S]{0,250}if\(!_session \|\| _session\.role!=='super' \|\| state\.admin\.role!=='super'\)/);
  });
  test(page+' never tries to embed credentials or automatic sign-in',()=>{
    const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
    const start=html.indexOf('function renderAdminWorkDiaries(){');
    const end=html.indexOf('function renderAdmin(){',start);
    assert.ok(start>=0 && end>start,'renderer exists');
    const code=html.slice(start,end);
    assert.match(code,/target="_blank" rel="noopener noreferrer"/);
    assert.match(code,/does not automatically log you in/);
    assert.doesNotMatch(code,/fetch\(|localStorage|password\s*=|service_role/);
  });
}
