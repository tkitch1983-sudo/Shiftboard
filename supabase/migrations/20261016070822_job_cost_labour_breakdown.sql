-- Expose existing per-invoice categories without multiplying job totals.
create or replace view public.jobs_margin_review with(security_invoker=true) as
with grouped as (
 select c.site_key,c.report_date,c.collected_at,e.job_number,
 string_agg(e.invoice_number,', ' order by e.invoice_number) invoice_numbers,
 sum(e.sell_ex_vat) sales,sum(e.cost_ex_vat) cost,sum(e.profit_ex_vat) profit,
 jsonb_agg(e.category_values order by e.invoice_number) category_breakdowns,
 bool_or('Tyres'=any(e.categories)) has_tyres,
 bool_and(e.categories <@ array['Tyres','Discount']::text[]) only_tyres,
 bool_or(cardinality(e.categories)=0) unknown_categories
 from public.jobs_selected_reports c join public.jobs_import_entries e on e.batch_id=c.id
 where c.source_kind='autowork' and e.transaction_kind='invoice'
 group by c.site_key,c.report_date,c.collected_at,e.job_number
 having count(*)=count(e.cost_ex_vat) and count(*)=count(e.profit_ex_vat)
)
select site_key,report_date,collected_at,job_number,invoice_numbers,sales,cost,profit,has_tyres,only_tyres,unknown_categories,case when sales>0 then round(profit/sales*100,2) end margin_pct,
case when has_tyres and only_tyres and not unknown_categories then 'tyre_only' when has_tyres then 'mixed' else 'other' end job_type,category_breakdowns
from grouped;
revoke all on public.jobs_margin_review from public,anon;
grant select on public.jobs_margin_review to authenticated,service_role;
