-- Daily Autowork reports share the existing management-only jobs model.
alter table public.jobs_import_batches add column source_kind text not null default 'email' check(source_kind in ('email','autowork'));
alter table public.jobs_import_batches add column collected_at timestamptz;
alter table public.jobs_import_entries add column cost_ex_vat numeric;
alter table public.jobs_import_entries add column profit_ex_vat numeric;
alter table public.jobs_import_entries add column source_margin_pct numeric;
alter table public.jobs_import_entries add column category_values jsonb;

create table public.jobs_direct_import_status(
 site_key text not null, report_date date not null,
 status text not null check(status in ('ok','failed')),
 attempted_at timestamptz not null default now(), error text,
 primary key(site_key,report_date)
);
alter table public.jobs_direct_import_status enable row level security;
revoke all on public.jobs_direct_import_status from public,anon,authenticated;
grant select on public.jobs_direct_import_status to authenticated;
grant all on public.jobs_direct_import_status to service_role;
create policy "Management reads direct import status" on public.jobs_direct_import_status for select to authenticated
using ((select auth.uid()) is not null and (
 (select auth.jwt()->'app_metadata'->>'role')='super' or
 ((select auth.jwt()->'app_metadata'->>'role')='site' and site_key=case (select auth.jwt()->'app_metadata'->>'siteId')
 when 's1' then 'seaham' when 's2' then 'peterlee' when 's3' then 'middlesbrough' when 's4' then 'hartlepool'
 when 's5' then 'gateshead' when 's6' then 'fairfield' when 's7' then 'chester-le-street' when 's8' then 'lido' else '__none__' end)));

-- Invoker + service-role-only EXECUTE: clients cannot stage or replace financial reports.
create function public.import_direct_profit_report(p_report jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare b uuid; s text:=p_report->>'site_key'; d date:=(p_report->>'report_date')::date;
 v_sum numeric; v_cost numeric; v_profit numeric; n integer;
begin
 if jsonb_typeof(p_report->'entries') is distinct from 'array' or jsonb_array_length(p_report->'entries')>5000 then raise exception 'Invalid entries'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s||':'||d::text,0));
 select count(*),coalesce(sum(sell_ex_vat),0),coalesce(sum(cost_ex_vat),0),coalesce(sum(profit_ex_vat),0)
 into n,v_sum,v_cost,v_profit from jsonb_to_recordset(p_report->'entries') as x(sell_ex_vat numeric,cost_ex_vat numeric,profit_ex_vat numeric);
 if p_report->>'report_sales_ex_vat' is null or p_report->>'report_cost_ex_vat' is null or p_report->>'report_profit_ex_vat' is null
 or abs(v_sum-(p_report->>'report_sales_ex_vat')::numeric)>0.02
 or abs(v_cost-(p_report->>'report_cost_ex_vat')::numeric)>0.02
 or abs(v_profit-(p_report->>'report_profit_ex_vat')::numeric)>0.02 then raise exception 'Report does not reconcile'; end if;
 if exists(select 1 from jsonb_to_recordset(p_report->'entries') x(sell_ex_vat numeric,cost_ex_vat numeric,profit_ex_vat numeric)
 where sell_ex_vat is null or cost_ex_vat is null or profit_ex_vat is null or abs(sell_ex_vat-cost_ex_vat-profit_ex_vat)>0.02) then raise exception 'Invalid financial row'; end if;
 insert into public.jobs_import_batches(site_key,report_date,source_sha256,source_filename,status,report_sales_ex_vat,calculated_sales_ex_vat,sales_reconciled,source_kind,collected_at)
 values(s,d,p_report->>'source_sha256','Autowork daily Profit Tracker','staged',v_sum,v_sum,true,'autowork',now())
 on conflict(site_key,report_date,source_sha256) do update set collected_at=excluded.collected_at
 returning id into b;
 if not exists(select 1 from public.jobs_import_entries where batch_id=b) then
 insert into public.jobs_import_entries(batch_id,site_key,report_date,invoice_number,job_number,transaction_kind,categories,classification,classification_method,sell_ex_vat,cost_ex_vat,profit_ex_vat,source_margin_pct,category_values)
 select b,s,d,x.invoice_number,x.job_number,x.transaction_kind,x.categories,x.classification,'rule',x.sell_ex_vat,x.cost_ex_vat,x.profit_ex_vat,x.source_margin_pct,x.category_values
 from jsonb_to_recordset(p_report->'entries') x(invoice_number text,job_number text,transaction_kind text,categories text[],classification text,sell_ex_vat numeric,cost_ex_vat numeric,profit_ex_vat numeric,source_margin_pct numeric,category_values jsonb);
 end if;
 insert into public.jobs_direct_import_status(site_key,report_date,status,attempted_at,error) values(s,d,'ok',now(),null)
 on conflict(site_key,report_date) do update set status='ok',attempted_at=excluded.attempted_at,error=null;
 return b;
end $$;
revoke all on function public.import_direct_profit_report(jsonb) from public,anon,authenticated;
grant execute on function public.import_direct_profit_report(jsonb) to service_role;

-- One selected report per site/day, shared by job counts and margin review.
-- A validated direct report takes precedence over email; email remains a fallback.
create view public.jobs_selected_reports with(security_invoker=true) as
select distinct on(b.site_key,b.report_date) b.* from public.jobs_import_batches b
where b.status in ('staged','verified') and b.sales_reconciled
and (b.source_kind='autowork' or exists(select 1 from public.jobs_import_entries e where e.batch_id=b.id and e.transaction_kind='invoice'))
and b.report_sales_ex_vat is not null
and abs(coalesce((select sum(e.sell_ex_vat) from public.jobs_import_entries e where e.batch_id=b.id),0)-b.report_sales_ex_vat)<=0.02
order by b.site_key,b.report_date,(b.source_kind='autowork') desc,
case when b.source_kind='autowork' then b.collected_at end desc nulls last,
(b.status='verified') desc,b.verified_at desc nulls last,b.created_at desc,b.id desc;
revoke all on public.jobs_selected_reports from public,anon;
grant select on public.jobs_selected_reports to authenticated,service_role;

create or replace view public.jobs_report_management with(security_invoker=true) as
with by_job as (
 select e.batch_id,e.job_number,bool_or(e.classification='service_repair') has_labour,bool_or(e.classification='review') needs_review
 from public.jobs_import_entries e join public.jobs_selected_reports c on e.batch_id=c.id where e.transaction_kind='invoice' group by e.batch_id,e.job_number
), totals as (
 select batch_id,count(*)::integer total_jobs,count(*) filter(where has_labour)::integer labour_candidates,
 count(*) filter(where needs_review and not has_labour)::integer review_jobs,count(*) filter(where not needs_review and not has_labour)::integer other_jobs
 from by_job group by batch_id
)
select c.site_key,c.report_date,c.status import_status,coalesce(j.total_jobs,0) total_jobs,
coalesce(j.labour_candidates,0) labour_candidates,coalesce(j.review_jobs,0) review_jobs,coalesce(j.other_jobs,0) other_jobs,
(select count(*)::integer from public.jobs_import_entries e where e.batch_id=c.id and e.transaction_kind='credit') credit_notes,
c.report_sales_ex_vat net_sales_ex_vat,c.source_kind,c.collected_at
from public.jobs_selected_reports c left join totals j on j.batch_id=c.id;

-- Financial review is grouped once per invoiced job. Credit notes stay separate.
create view public.jobs_margin_review with(security_invoker=true) as
with grouped as (
 select c.site_key,c.report_date,c.collected_at,e.job_number,
 string_agg(e.invoice_number,', ' order by e.invoice_number) invoice_numbers,
 sum(e.sell_ex_vat) sales,sum(e.cost_ex_vat) cost,sum(e.profit_ex_vat) profit,
 bool_or('Tyres'=any(e.categories)) has_tyres,
 bool_and(e.categories <@ array['Tyres','Discount']::text[]) only_tyres,
 bool_or(cardinality(e.categories)=0) unknown_categories
 from public.jobs_selected_reports c join public.jobs_import_entries e on e.batch_id=c.id
 where c.source_kind='autowork' and e.transaction_kind='invoice'
 group by c.site_key,c.report_date,c.collected_at,e.job_number
 having count(*)=count(e.cost_ex_vat) and count(*)=count(e.profit_ex_vat)
)
select *,case when sales>0 then round(profit/sales*100,2) end margin_pct,
case when has_tyres and only_tyres and not unknown_categories then 'tyre_only' when has_tyres then 'mixed' else 'other' end job_type
from grouped;
revoke all on public.jobs_margin_review from public,anon;
grant select on public.jobs_margin_review to authenticated,service_role;
