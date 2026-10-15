create table public.jobs_invoice_documents(
 site_key text not null check(site_key in ('seaham','peterlee','middlesbrough','hartlepool','gateshead','fairfield','chester-le-street','lido')),
 report_date date not null, invoice_number text not null check(invoice_number ~ '^I[A-Z0-9-]+$'),
 job_number text not null, storage_path text not null unique,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 collected_at timestamptz not null default now(),
 primary key(site_key,report_date,invoice_number),
 check(storage_path=site_key||'/'||report_date::text||'/'||invoice_number||'.pdf')
);
alter table public.jobs_invoice_documents enable row level security;
revoke all on public.jobs_invoice_documents from public,anon,authenticated;
grant select on public.jobs_invoice_documents to authenticated;
grant all on public.jobs_invoice_documents to service_role;
create policy "Managers view their invoices" on public.jobs_invoice_documents for select to authenticated using(
 (select auth.uid()) is not null and (
 (select auth.jwt()->'app_metadata'->>'role')='super' or
 ((select auth.jwt()->'app_metadata'->>'role')='site' and site_key=case (select auth.jwt()->'app_metadata'->>'siteId')
 when 's1' then 'seaham' when 's2' then 'peterlee' when 's3' then 'middlesbrough' when 's4' then 'hartlepool'
 when 's5' then 'gateshead' when 's6' then 'fairfield' when 's7' then 'chester-le-street' when 's8' then 'lido' else '__none__' end)));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('job-invoices','job-invoices',false,10485760,array['application/pdf']);
create policy "Managers download their collected invoices" on storage.objects for select to authenticated
using(bucket_id='job-invoices' and exists(select 1 from public.jobs_invoice_documents d where d.storage_path=name));
