-- Branch trading calendar: all eight workshops are closed on Sundays;
-- Hartlepool is additionally closed on Saturdays.
-- Do not manufacture a zero-value Profit Tracker to represent a closure.
create or replace function public.mark_scheduled_closed_job_day(
  p_site_key text,p_report_date date
) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_site_key is null
     or p_site_key not in (
       'chester-le-street','fairfield','gateshead','hartlepool',
       'lido','middlesbrough','peterlee','seaham'
     )
     or p_report_date is null
     or not (
       extract(isodow from p_report_date)=7
       or (p_site_key='hartlepool' and extract(isodow from p_report_date)=6)
     ) then
    raise exception 'Not a configured scheduled closure';
  end if;

  -- Do not overwrite a legitimate reconciled financial report.
  if exists (
    select 1 from public.jobs_import_batches b
    where b.site_key=p_site_key and b.report_date=p_report_date
      and b.source_kind='autowork' and b.sales_reconciled
  ) then return; end if;

  insert into public.jobs_direct_import_status(site_key,report_date,status,attempted_at,error)
  values(p_site_key,p_report_date,'closed',now(),null)
  on conflict(site_key,report_date) do update
    set status='closed',attempted_at=excluded.attempted_at,error=null
    where public.jobs_direct_import_status.status <> 'ok';
end $$;
revoke all on function public.mark_scheduled_closed_job_day(text,date)
  from public,anon,authenticated;
grant execute on function public.mark_scheduled_closed_job_day(text,date)
  to service_role;

-- Replace only incorrect Sunday failures already generated on 18 October.
-- Never alter any real profit-report batch, invoices, sales, or margins.
update public.jobs_direct_import_status s
set status='closed',attempted_at=now(),error=null
where s.report_date=date '2026-10-18'
  and extract(isodow from s.report_date)=7
  and s.site_key in (
    'chester-le-street','fairfield','gateshead','hartlepool',
    'lido','middlesbrough','peterlee','seaham'
  )
  and s.status='failed'
  and not exists (
    select 1 from public.jobs_import_batches b
    where b.site_key=s.site_key and b.report_date=s.report_date
      and b.source_kind='autowork' and b.sales_reconciled
  );
