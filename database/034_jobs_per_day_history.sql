-- Shiftboard Jobs Per Day: draft migration. Do not apply until pilot is approved.
-- The invoice date is the reporting date. Credit notes adjust sales but do not create jobs.
create table if not exists public.jobs_import_batches (
 id uuid primary key default gen_random_uuid(),
 site_key text not null check (site_key in ('seaham','peterlee','middlesbrough','hartlepool','gateshead','fairfield','chester-le-street','lido')),
 report_date date not null,
 source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
 source_message_id text,
 source_attachment_id text,
 source_filename text,
 source_received_at timestamptz,
 status text not null default 'staged' check (status in ('staged','verified','rejected')),
 report_sales_ex_vat numeric(14,2),
 calculated_sales_ex_vat numeric(14,2),
 sales_reconciled boolean not null default false,
 warnings jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 verified_at timestamptz,
 verified_by text,
 unique(site_key, report_date, source_sha256),
 check (status <> 'verified' or (sales_reconciled and verified_at is not null))
);
create table if not exists public.jobs_import_entries (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.jobs_import_batches(id) on delete cascade,
 site_key text not null,
 report_date date not null,
 invoice_number text not null,
 job_number text not null,
 transaction_kind text not null check(transaction_kind in ('invoice','credit')),
 categories text[] not null default '{}'::text[],
 classification text not null check(classification in ('service_repair','other','review')),
 classification_method text not null default 'rule' check(classification_method in ('rule','manual')),
 classification_note text,
 sell_ex_vat numeric(14,2) not null,
 unique(batch_id,invoice_number),
 check(length(trim(invoice_number)) > 0 and length(trim(job_number)) > 0)
);
create index if not exists jobs_import_batches_date_idx on public.jobs_import_batches(report_date desc,site_key,status);
create index if not exists jobs_import_entries_job_idx on public.jobs_import_entries(site_key,job_number,report_date);
create index if not exists jobs_import_entries_batch_idx on public.jobs_import_entries(batch_id,transaction_kind);
alter table public.jobs_import_batches enable row level security;
alter table public.jobs_import_entries enable row level security;
revoke all on public.jobs_import_batches from anon,authenticated;
revoke all on public.jobs_import_entries from anon,authenticated;
grant select on public.jobs_import_batches to authenticated;
grant select on public.jobs_import_entries to authenticated;
-- Service-role ingestion only. Site managers may read records from their assigned workshop.
drop policy if exists "jobs manager select batches" on public.jobs_import_batches;
create policy "jobs manager select batches" on public.jobs_import_batches
 for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'role')='super' or (
 (select auth.jwt()->'app_metadata'->>'role')='site'
 and site_key=case (select auth.jwt()->'app_metadata'->>'siteId')
 when 's1' then 'seaham' when 's2' then 'peterlee'
 when 's3' then 'middlesbrough' when 's4' then 'hartlepool'
 when 's5' then 'gateshead' when 's6' then 'fairfield'
 when 's7' then 'chester-le-street' when 's8' then 'lido' else '__none__' end
 ));
drop policy if exists "jobs manager select entries" on public.jobs_import_entries;
create policy "jobs manager select entries" on public.jobs_import_entries
 for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'role')='super' or (
 (select auth.jwt()->'app_metadata'->>'role')='site'
 and site_key=case (select auth.jwt()->'app_metadata'->>'siteId')
 when 's1' then 'seaham' when 's2' then 'peterlee'
 when 's3' then 'middlesbrough' when 's4' then 'hartlepool'
 when 's5' then 'gateshead' when 's6' then 'fairfield'
 when 's7' then 'chester-le-street' when 's8' then 'lido' else '__none__' end
 ));
-- Prefer the newest verified revision of a branch/date, never add revisions together.
create or replace view public.jobs_daily_summary with (security_invoker=true) as
with selected as (
 select distinct on (site_key,report_date)
 id,site_key,report_date,source_filename,report_sales_ex_vat,verified_at
 from public.jobs_import_batches
 where status='verified' and sales_reconciled
 order by site_key,report_date,verified_at desc,created_at desc,id desc
), per_job as (
 select s.id as batch_id,e.job_number,
 bool_or(e.classification='service_repair') as is_service,
 bool_or(e.classification='review') as needs_review
 from selected s join public.jobs_import_entries e on e.batch_id=s.id
 where e.transaction_kind='invoice' group by s.id,e.job_number
), jobs_aggregate as (
 select batch_id,count(*)::integer as total_jobs,
 count(*) filter(where is_service)::integer as service_repair_confirmed,
 count(*) filter(where needs_review and not is_service)::integer as review_jobs
 from per_job group by batch_id
), credits_aggregate as (
 select e.batch_id,count(*)::integer as credit_count
 from public.jobs_import_entries e join selected s on s.id=e.batch_id
 where e.transaction_kind='credit' group by e.batch_id
)
select s.site_key,s.report_date,
 coalesce(j.total_jobs,0) as total_jobs,
 coalesce(j.service_repair_confirmed,0) as service_repair_confirmed,
 coalesce(j.review_jobs,0) as review_jobs,
 coalesce(c.credit_count,0) as credit_count,
 s.report_sales_ex_vat as net_sales_ex_vat,
 s.verified_at
from selected s
left join jobs_aggregate j on j.batch_id=s.id
left join credits_aggregate c on c.batch_id=s.id;
revoke all on public.jobs_daily_summary from public,anon;
grant select on public.jobs_daily_summary to authenticated;
comment on view public.jobs_daily_summary is
 'Verified invoiced jobs per branch/date. Service/repair is a subset; review jobs are shown separately; missing reports are not zeros.';
