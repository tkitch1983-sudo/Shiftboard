-- A workshop's scheduled closure is not a failed import or a verified £0 report.
alter table public.jobs_direct_import_status
  drop constraint jobs_direct_import_status_status_check;
alter table public.jobs_direct_import_status
  add constraint jobs_direct_import_status_status_check
  check (status in ('ok','failed','closed'));

-- Only the service-role nightly worker may record Hartlepool's regular Saturday
-- closure. Preserve any previously verified direct Autowork data for that date.
create function public.mark_scheduled_closed_job_day(p_site_key text,p_report_date date)
returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_site_key is distinct from 'hartlepool'
     or p_report_date is null
     or extract(isodow from p_report_date) <> 6 then
    raise exception 'Not a configured scheduled closure';
  end if;

  if exists (
    select 1 from public.jobs_import_batches b
    where b.site_key=p_site_key and b.report_date=p_report_date
      and b.source_kind='autowork' and b.sales_reconciled
  ) then
    return;
  end if;

  insert into public.jobs_direct_import_status(site_key,report_date,status,attempted_at,error)
  values (p_site_key,p_report_date,'closed',now(),null)
  on conflict(site_key,report_date) do update
    set status='closed',attempted_at=excluded.attempted_at,error=null
    where public.jobs_direct_import_status.status <> 'ok';
end $$;
revoke all on function public.mark_scheduled_closed_job_day(text,date)
  from public,anon,authenticated;
grant execute on function public.mark_scheduled_closed_job_day(text,date)
  to service_role;

-- Correct only the known false failure, never touch financial batch/entry data.
update public.jobs_direct_import_status s
set status='closed',attempted_at=now(),error=null
where s.site_key='hartlepool' and s.report_date=date '2026-10-17'
  and s.status='failed'
  and not exists (
    select 1 from public.jobs_import_batches b
    where b.site_key=s.site_key and b.report_date=s.report_date
      and b.source_kind='autowork' and b.sales_reconciled
  );
