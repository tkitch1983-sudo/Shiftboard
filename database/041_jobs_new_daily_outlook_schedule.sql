-- Start *new* day-sheet intake, independently of the 2024-2026 archive backfill.
-- pg_cron stores these schedules in UTC. The Graph worker filters the received
-- date in UTC and reads the PDF invoice/report date independently.
--
-- Hourly at :01 picks up all new email received so far today; the prior-day
-- safety sweep at 05:31 UTC catches late previous-evening mail.
-- Cron runs at minutes that do not collide with the historical :00/:02 scans.
-- Existing PDF hashes/site/date uniqueness make re-scans idempotent.
create or replace function public.jobs_dispatch_current_received_day()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_day date;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(803914204) then return null; end if;
 v_day:=(now() at time zone 'UTC')::date;
 return public.jobs_trigger_backfill_day(v_day);
end $$;
create or replace function public.jobs_dispatch_previous_received_day()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_day date;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(803914205) then return null; end if;
 v_day:=(now() at time zone 'UTC')::date-1;
 return public.jobs_trigger_backfill_day(v_day);
end $$;
revoke all on function public.jobs_dispatch_current_received_day() from public,anon,authenticated;
revoke all on function public.jobs_dispatch_previous_received_day() from public,anon,authenticated;
comment on function public.jobs_dispatch_current_received_day() is
 'Private recurring received-day scan for fresh Tony Day Sheets and Lido Inbox emails; PDF invoice date is stored separately. Results staged and never published directly.';
comment on function public.jobs_dispatch_previous_received_day() is
 'Previous UTC received-day safety sweep. Source PDF hashes prevent duplicate jobs.';

-- Keep both cron jobs after the historical archive auto-unschedules itself.
select cron.schedule(
  'jobs-daily-inbox',
  '1 * * * *',
  'select public.jobs_dispatch_current_received_day();'
);
select cron.schedule(
  'jobs-daily-prior-day',
  '31 5 * * *',
  'select public.jobs_dispatch_previous_received_day();'
);
