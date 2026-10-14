import { parseReport, gbDate } from "./parser.ts";
const report = [
 "Profit Tracker","Date Produced:","12/10/2024","Date Range:","12/10/2024","12/10/2024",
 "Invoice/Credit Number","I0001","Job","J0001","Date","12/10/2024",
 "Type Cost Sell Profit Margin %",
 "0.00 50.00 50.00 100.00% Labour","0.00 50.00 50.00 100.00% Total",
 "Invoice/Credit Number","I0002","Job","J0001","Date","12/10/2024",
 "Type Cost Sell Profit Margin %",
 "0.00","25.00","25.00","100.00%","Fixed Price",
 "0.00","25.00","25.00","100.00%","Total",
 "Invoice/Credit Number","C0003","Job","J0001","Date","12/10/2024",
 "Type Cost Sell Profit Margin %",
 "0.00 -10.00 -10.00 -100.00% Discount",
 "0.00 -10.00 -10.00 -100.00% Total",
 "Invoice/Credit Number","I0004","Job","J0002","Date","12/10/2024",
 "Type Cost Sell Profit Margin %",
 "0.00 20.00 20.00 100.00% MOT","0.00 20.00 20.00 100.00% Total",
 "Totals","Type Cost Sell Profit Margin %",
 "0.00 85.00 85.00 100.00% Total"
].join("\n");

Deno.test("daily report preserves invoice date, credit and job deduplication",()=>{
 const result = parseReport(report,"hartlepool","0".repeat(64));
 if(!result)throw Error("Expected a report");
 if(result.total_jobs!==2)throw Error("Two unique jobs expected");
 if(result.entries.length!==4)throw Error("Four invoice/credit entries expected");
 if(result.labour_candidates!==1||result.review_jobs!==0)throw Error("Classification changed");
 if(result.report_sales_ex_vat!=="85.00")throw Error("Sales reconciliation incorrect");
});
Deno.test("rejects mixed report dates",()=>{
 const altered=report.replace("Date Range:\n12/10/2024\n12/10/2024",
   "Date Range:\n11/10/2024\n12/10/2024");
 let rejected=false;
 try{parseReport(altered,"hartlepool","0".repeat(64));}
 catch{rejected=true;}
 if(!rejected)throw Error("Expected mixed-date report rejection");
});
Deno.test("validates Gregorian report dates",()=>{
 let rejected=false;try{gbDate("31/02/2025");}catch{rejected=true;}
 if(!rejected)throw Error("Invalid date was accepted");
});
