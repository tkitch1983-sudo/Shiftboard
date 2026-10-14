-- Secure, staged-only historical Outlook import runner.
-- Does not change existing Shiftboard reporting or publish any unverified job.
create extension if not exists pg_net with schema extensions;
create table if not exists public.jobs_backfill_runner_auth (
  id integer primary key check (id = 1),
  internal_key text not null,
  created_at timestamptz not null default now()
);
insert into public.jobs_backfill_runner_auth (id, internal_key)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create table if not exists public.jobs_backfill_run_audit (
  id uuid primary key default gen_random_uuid(),
  report_day date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running','completed','partial','failed')),
  reports_found integer not null default 0,
  reports_staged integer not null default 0,
  messages_seen integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb
);
create index if not exists jobs_backfill_run_day on public.jobs_backfill_run_audit(report_day desc, started_at desc);
alter table public.jobs_backfill_runner_auth enable row level security;
alter table public.jobs_backfill_run_audit enable row level security;
revoke all on public.jobs_backfill_runner_auth from public,anon,authenticated;
revoke all on public.jobs_backfill_run_audit from public,anon,authenticated;
comment on table public.jobs_backfill_runner_auth is 'Private internal trigger secret for server-to-server Outlook job ingestion. Never disclose.';
comment on table public.jobs_backfill_run_audit is 'Coverage and error audit per import day. Does not equate missing reports to zero jobs.';

-- The tool/operator invokes this manually for an approved pilot date.
-- The trigger calls the Edge Function with a private header through pg_net.
create or replace function public.jobs_trigger_backfill_day(p_day date)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
 v_key text;
 v_request bigint;
begin
 if p_day < date '2024-10-12' or p_day > current_date then
   raise exception 'Import day outside authorised history';
 end if;
 select internal_key into v_key from public.jobs_backfill_runner_auth where id=1;
 if v_key is null then raise exception 'Runner not provisioned'; end if;
 select net.http_post(
   url := 'https://disgpocvqitpeceqhuim.supabase.co/functions/v1/shiftboard-jobs-backfill',
   headers := jsonb_build_object('content-type','application/json','x-shiftboard-run-key',v_key),
   body := jsonb_build_object('report_day',p_day),
   timeout_milliseconds := 120000
 ) into v_request;
 return v_request;
end $$;
revoke all on function public.jobs_trigger_backfill_day(date) from public,anon,authenticated;
