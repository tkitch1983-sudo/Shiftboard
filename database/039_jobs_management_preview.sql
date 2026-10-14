-- Provisional Jobs Report: management-only branch/day aggregates, no private invoice references.
-- security_invoker ensures existing jobs_import_* RLS policies are enforced for each manager.
create or replace view public.jobs_report_management with (security_invoker=true) as
with reconciled as (
 select b.id,b.site_key,b.report_date,b.status,b.report_sales_ex_vat,b.created_at,b.verified_at
 from public.jobs_import_batches b
 where b.status in ('staged','verified') and b.sales_reconciled
 and exists (select 1 from public.jobs_import_entries e where e.batch_id=b.id and e.transaction_kind='invoice')
 and abs(coalesce((select sum(e.sell_ex_vat) from public.jobs_import_entries e where e.batch_id=b.id),0) -
         coalesce(b.report_sales_ex_vat,0))<=0.02
), chosen as (
 select distinct on (site_key,report_date) *
 from reconciled
 order by site_key,report_date,
  case when status='verified' then 0 else 1 end,
  verified_at desc nulls last,created_at desc,id desc
), by_job as (
 select c.id,e.job_number,
  bool_or(e.classification='service_repair') as has_labour,
  bool_or(e.classification='review') as needs_review
 from chosen c join public.jobs_import_entries e on e.batch_id=c.id
 where e.transaction_kind='invoice'
 group by c.id,e.job_number
), job_totals as (
 select id,count(*)::integer as total_jobs,
  count(*) filter(where has_labour)::integer as labour_candidates,
  count(*) filter(where needs_review and not has_labour)::integer as review_jobs,
  count(*) filter(where not needs_review and not has_labour)::integer as other_jobs
 from by_job group by id
), credit_totals as (
 select c.id,count(e.id)::integer as credit_notes
 from chosen c left join public.jobs_import_entries e on e.batch_id=c.id and e.transaction_kind='credit'
 group by c.id
)
select c.site_key,c.report_date,c.status as import_status,
 j.total_jobs,j.labour_candidates,j.review_jobs,j.other_jobs,
 cr.credit_notes,c.report_sales_ex_vat as net_sales_ex_vat
from chosen c join job_totals j on j.id=c.id
join credit_totals cr on cr.id=c.id;

revoke all on public.jobs_report_management from public,anon;
grant select on public.jobs_report_management to authenticated;
comment on view public.jobs_report_management is
 'Manager/site RLS-controlled report of verified or reconciled provisional job counts. Labour-coded values are only service/repair candidates. No invoice identifiers or unvalidated batches. Missing site-days are unknown, not zero.';

-- A summary of progress without exposing email message IDs, private importer secret or PDF content.
create or replace function public.jobs_report_import_progress()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare answer jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'super' then
  raise exception 'Upper management access required' using errcode='42501';
 end if;
 select jsonb_build_object(
  'first_report_date',date '2024-10-12',
  'last_target_received_day',date '2026-10-13',
  'days_attempted',(select count(distinct a.report_day) from public.jobs_backfill_run_audit a),
  'days_with_exceptions',(select count(distinct a.report_day) from public.jobs_backfill_run_audit a where a.status in ('partial','failed')),
  'latest_received_date_attempted',(select max(a.report_day) from public.jobs_backfill_run_audit a
    where a.report_day < date '2026-01-01'),
  'staged_branch_days',(select count(*) from public.jobs_import_batches b where b.status='staged'),
  'approved_branch_days',(select count(*) from public.jobs_import_batches b where b.status='verified'),
  'scheduler_active',exists(select 1 from cron.job j where j.jobname='jobs-history-archive' and j.active)
 ) into answer;
 return answer;
end $$;
revoke all on function public.jobs_report_import_progress() from public,anon;
grant execute on function public.jobs_report_import_progress() to authenticated;
