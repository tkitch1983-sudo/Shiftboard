-- One archived received-day at a time; the Edge Function remains staging-only.
-- Each date is attempted once and audited. Corrections and failed days remain reviewable.
create or replace function public.jobs_dispatch_next_backfill_day()
returns date language plpgsql security definer set search_path = ''
as $$
declare
 next_day date;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(803914203) then return null; end if;

 select d::date into next_day
 from pg_catalog.generate_series(date '2024-10-12', date '2026-10-13', interval '1 day') d
 where not exists (
   select 1 from public.jobs_backfill_run_audit b where b.report_day=d::date
 )
 order by d limit 1;

 if next_day is null then
   perform cron.unschedule('jobs-history-archive');
   return null;
 end if;
 perform public.jobs_trigger_backfill_day(next_day);
 return next_day;
end $$;
revoke all on function public.jobs_dispatch_next_backfill_day() from public,anon,authenticated;
comment on function public.jobs_dispatch_next_backfill_day() is
 'One inbox received-date per run. Missing reports are audited as unknown, not zero. Unschedules at end.';
