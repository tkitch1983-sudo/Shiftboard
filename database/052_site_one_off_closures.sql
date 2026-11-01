create table public.site_one_off_closures (
 site_key text not null check (site_key in ('chester-le-street','fairfield','gateshead','hartlepool','lido','middlesbrough','peterlee','seaham')),
 closure_date date not null,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 primary key(site_key,closure_date)
);
alter table public.site_one_off_closures enable row level security;
grant select,insert,delete on public.site_one_off_closures to authenticated;
grant all on public.site_one_off_closures to service_role;
create policy closures_upper_management on public.site_one_off_closures for all to authenticated
 using ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='super')
 with check ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='super');
insert into public.site_one_off_closures(site_key,closure_date) values ('lido','2026-10-31');
create or replace function public.mark_scheduled_closed_job_day(p_site_key text,p_report_date date)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_site_key is null or p_site_key not in ('chester-le-street','fairfield','gateshead','hartlepool','lido','middlesbrough','peterlee','seaham')
 or p_report_date is null or not (
 extract(isodow from p_report_date)=7
 or (p_site_key='hartlepool' and extract(isodow from p_report_date)=6)
 or exists(select 1 from public.site_one_off_closures where site_key=p_site_key and closure_date=p_report_date)
 ) then raise exception 'Not a configured scheduled closure'; end if;
 if exists(select 1 from public.jobs_import_batches b where b.site_key=p_site_key and b.report_date=p_report_date and b.source_kind='autowork' and b.sales_reconciled) then return; end if;
 insert into public.jobs_direct_import_status(site_key,report_date,status,attempted_at,error)
 values(p_site_key,p_report_date,'closed',now(),null)
 on conflict(site_key,report_date) do update set status='closed',attempted_at=excluded.attempted_at,error=null
 where public.jobs_direct_import_status.status <> 'ok';
end $$;
revoke all on function public.mark_scheduled_closed_job_day(text,date) from public,anon,authenticated;
grant execute on function public.mark_scheduled_closed_job_day(text,date) to service_role;
