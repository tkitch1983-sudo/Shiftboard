const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const data={invoices:[{site_key:'gateshead',report_date:day,job_number:'J001',invoice_number:'I001',storage_path:'gateshead/'+day+'/I001.pdf'}],rows:[
 {site_key:'gateshead',report_date:day,job_number:'J001',invoice_numbers:'I001',job_type:'other',sales:200,cost:110,profit:90,margin_pct:45},
 {site_key:'gateshead',report_date:day,job_number:'J002',invoice_numbers:'I002',job_type:'tyre_only',sales:200,cost:140,profit:60,margin_pct:30},
 {site_key:'gateshead',report_date:day,job_number:'J003',invoice_numbers:'I003',job_type:'mixed',sales:200,cost:210,profit:-10,margin_pct:-5},
 {site_key:'gateshead',report_date:day,job_number:'J004',invoice_numbers:'I004',job_type:'other',sales:100,cost:54.99,profit:45.01,margin_pct:45.01},
 {site_key:'gateshead',report_date:day,job_number:'J005',invoice_numbers:'I005',job_type:'other',sales:0,cost:0,profit:0,margin_pct:null}
],reports:[{site_key:'gateshead',report_date:day,source_kind:'autowork',total_jobs:5,credit_notes:1,collected_at:new Date().toISOString()}],statuses:[{site_key:'gateshead',report_date:day,status:'ok'}]};
await page.setContent(`<style>:root{--bg:#101723;--panel:#182232;--text:#eff4fa;--muted:#a5b3c5;--line:#344258;--amber:#efb34b;--red:#ef6464}body{font-family:Arial;background:var(--bg);color:var(--text);margin:25px}.card{padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.add-btn{color:var(--text);background:#26354b;border:1px solid var(--line);padding:10px 14px;border-radius:8px;cursor:pointer}</style><main id="app"></main>`);
await page.evaluate(data=>{
window._session={email:'qa@example.test',role:'super'};window.state={view:'admin',admin:{authed:true,role:'super',tab:'jobs'}};window.SUPABASE_URL='https://example.test';window.authHeaders=async()=>({});
window.open=()=>window._invoiceTab={location:{href:''},close(){}};
window.fetch=async(url)=>({ok:true,blob:async()=>new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),json:async()=>url.includes('jobs_margin_review')?data.rows:url.includes('jobs_report_management')?data.reports:url.includes('jobs_invoice_documents')?data.invoices:data.statuses});
window.NEASJobs={render:()=>'<h2>Job totals test view</h2>'};window.render=()=>document.querySelector('#app').innerHTML=window.NEASJobs.render();
},data);
await page.addScriptTag({content:fs.readFileSync('profit-review.js','utf8')});
await page.evaluate(()=>render());await page.waitForSelector('.pr-job');
await page.locator('[data-profit-invoice]').click();await page.waitForFunction(()=>window._invoiceTab.location.href.startsWith('blob:'));
const all=await page.locator('.pr-job').count();if(all!==3)throw Error('Inclusive 45% threshold failed');
await page.locator('[data-profit-filter=filter]').selectOption('tyres');
if(!(await page.locator('.pr-job').allTextContents()).every(t=>t.includes('Tyre-only')))throw Error('Tyre filter failed');
await page.locator('[data-profit-filter=filter]').selectOption('review');
if((await page.locator('.pr-job').allTextContents()).some(t=>t.includes('Tyre-only')))throw Error('Review filter failed');
await page.locator('[data-profit-filter=filter]').selectOption('low');
await page.screenshot({path:'profit-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'profit-mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
await page.locator('[data-profit-filter=filter]').selectOption('checks');if(await page.locator('.pr-job').count()!==1)throw Error('Zero sale check filter');
await page.locator('[data-profit-action=totals]').click();if(!await page.getByText('Job totals test view').count())throw Error('Totals tab failed');
await page.evaluate(()=>{_session=null;render()});if(await page.locator('.pr-job').count())throw Error('Signed out data visible');
console.log(JSON.stringify({allLowJobs:all,errors,mobileOverflow:false,filters:'passed',signout:'passed'}));
await browser.close();if(errors.length)process.exitCode=1;
})();
