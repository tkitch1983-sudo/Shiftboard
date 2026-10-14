import { getDocumentProxy, extractTextItems } from "npm:unpdf@1.8.1";

export type ParsedReport={
  site_key:string;report_date:string;source_sha256:string;
  report_sales_ex_vat:string; calculated_sales_ex_vat:string;
  total_jobs:number; labour_candidates:number;review_jobs:number;entries:any[];
};
export function gbDate(value:string):string{
 const [d,m,y]=value.split("/").map(Number);
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCDate()!==d||dt.getUTCMonth()!==m-1||dt.getUTCFullYear()!==y)
   throw Error("invalid_date");
 return [y,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
function cents(input:string):number{
 const n=String(input).replaceAll(",","");
 if(!/^-?\d+\.\d{2}$/.test(n))throw Error("invalid_amount");
 return Math.round(Number(n)*100);
}
function rows(block:string){
 // FitZ places each field on its own line; PDF.js can place adjacent
 // fields on one line. Parse the numeric four-column REPDATAB rows.
 const pattern=/([-+]?\d[\d,]*\.\d{2})\s+([-+]?\d[\d,]*\.\d{2})\s+([-+]?\d[\d,]*\.\d{2})\s+([-+]?\d[\d,]*\.\d{2})\s*%\s+(Parts|Labour|MOT|Fixed Price|Tyres|Discount|Total)\b/g;
 return Array.from(block.matchAll(pattern),m=>({type:m[5],sell:cents(m[2])}));
}
function lineTotal(block:string):number{
 const totals=rows(block).filter(r=>r.type==="Total");
 if(!totals.length)throw Error("missing_line_total");
 return totals[totals.length-1].sell;
}
export async function pdfToText(bytes:Uint8Array):Promise<string>{
 const doc=await getDocumentProxy(bytes,{maxImageSize:16777216});
 if(doc.numPages<1||doc.numPages>24)throw Error("unexpected_pdf_length");
 const data=await extractTextItems(doc);
 if(data.totalPages!==doc.numPages)throw Error("pdf_page_mismatch");
 return data.items.map(page=>page.map(item=>item.str.trim()+(item.hasEOL?"\n":" ")).join("")).join("\n");
}
export function parseReport(text:string,site:string,hash:string):ParsedReport|null {
 if(!/Profit Tracker/i.test(text))return null;
 const dates=text.match(/Date Range:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/i);
 if(!dates||dates[1]!==dates[2])throw Error("multi_day_or_unknown_date");
 const reportDate=gbDate(dates[1]);
 const pattern=/Invoice\/Credit Number\s+([A-Z][A-Z0-9-]*)\s+Job\s+([A-Z][A-Z0-9-]*)\s+Date\s+(\d{2}\/\d{2}\/\d{4})/gi;
 const invoices=Array.from(text.matchAll(pattern));
 if(!invoices.length)throw Error("no_invoice_jobs");
 const totalsAt=text.lastIndexOf("\nTotals\n");
 if(totalsAt<0)throw Error("totals_missing");
 const allowed=new Set(["Parts","Labour","MOT","Fixed Price","Tyres","Discount"]);
 const seenInvoices=new Set<string>();
 const grouped=new Map<string,Set<string>>();
 const entries:any[]=[];
 let sum=0;
 for(let i=0;i<invoices.length;i++){
  const match=invoices[i],invoice=match[1].toUpperCase(),job=match[2].toUpperCase();
  if(seenInvoices.has(invoice))throw Error("duplicate_invoice");
  seenInvoices.add(invoice);
  if(gbDate(match[3])!==reportDate)throw Error("invoice_date_differs");
  const stop=i+1<invoices.length?invoices[i+1].index!:totalsAt;
  if(stop<=match.index!)throw Error("malformed_invoice_block");
  const block=text.slice(match.index!+match[0].length,stop);
  const cat=new Set(rows(block).map(r=>r.type).filter(x=>x!=="Total"));
  if(!cat.size)throw Error("missing_categories");
  for(const c of cat)if(!allowed.has(c))throw Error("unknown_category");
  const value=lineTotal(block),kind=invoice.startsWith("I")?"invoice":invoice.startsWith("C")?"credit":"invalid";
  if(kind==="invalid")throw Error("unknown_invoice_prefix");
  sum+=value;
  if(kind==="invoice") {
    const all=grouped.get(job)||new Set<string>();
    for(const c of cat)all.add(c);
    grouped.set(job,all);
  }
  entries.push({site_key:site,report_date:reportDate,invoice_number:invoice,
   job_number:job,transaction_kind:kind,categories:Array.from(cat).sort(),
   classification:"other",sell_ex_vat:(value/100).toFixed(2)});
 }
 const reported=lineTotal(text.slice(totalsAt+"\nTotals\n".length));
 if(Math.abs(reported-sum)>2)throw Error("sales_reconciliation_failed");
 for(const e of entries)if(e.transaction_kind==="invoice"){
  const cats=grouped.get(e.job_number)!;
  e.classification=cats.has("Labour")?"service_repair":cats.has("Fixed Price")?"review":"other";
 }
 const counts=Array.from(grouped.values());
 return {site_key:site,report_date:reportDate,source_sha256:hash,
  report_sales_ex_vat:(reported/100).toFixed(2),calculated_sales_ex_vat:(sum/100).toFixed(2),
  total_jobs:counts.length,labour_candidates:counts.filter(x=>x.has("Labour")).length,
  review_jobs:counts.filter(x=>!x.has("Labour")&&x.has("Fixed Price")).length,entries};
}
