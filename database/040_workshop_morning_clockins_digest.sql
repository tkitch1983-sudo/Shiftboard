-- Daily 08:40 UK workshop clock-in digest for management only.
-- Live, non-public summary of ACTIVE s1-s8 employees with no 'in' event by 08:40.
-- There is no rota data in Shiftboard; the report must NOT call these staff absent.
create or replace function public.internal_workshop_morning_clockins(
  p_day date,
  p_cutoff time without time zone default '08:40'
)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
with
config as (
 select value from public.shift_board where key='config'
),
workshops as (
 select x->>'id' as site_id, x->>'name' as site_name
 from config c cross join lateral pg_catalog.jsonb_array_elements(c.value->'sites') x
 where x->>'id' in ('s1','s2','s3','s4','s5','s6','s7','s8')
),
active_staff as (
 select e->>'id' as emp_id,e->>'name' as emp_name,e->>'siteId' as site_id,
  nullif(e->>'customStart','') as custom_start
 from config c cross join lateral pg_catalog.jsonb_array_elements(c.value->'employees') e
 where coalesce(e->>'active','true')='true'
   and e->>'siteId' in ('s1','s2','s3','s4','s5','s6','s7','s8')
),
approved_leave as (
 select distinct h->>'employeeId' as emp_id
 from public.shift_board b
 cross join lateral pg_catalog.jsonb_array_elements(b.value) h
 cross join lateral pg_catalog.jsonb_array_elements(
  case when pg_catalog.jsonb_typeof(h->'dates')='array' then h->'dates' else '[]'::jsonb end
 ) d
 where b.key='holidayRequests' and h->>'status'='approved'
 and d->>'date'=p_day::text
),
recorded_absence as (
 select distinct a->>'employeeId' as emp_id
 from public.shift_board b cross join lateral pg_catalog.jsonb_array_elements(b.value) a
 where b.key='absences'
   and a->>'type' in ('sick','authorised')
   and (a->>'date'=p_day::text or
        (a->>'periodStart' <= p_day::text and a->>'periodEnd' >= p_day::text))
),
clockins as (
 select distinct ev->>'employeeId' as emp_id
 from public.shift_board b cross join lateral pg_catalog.jsonb_array_elements(b.value) ev
 where b.key='clockEvents' and ev->>'type'='in'
 and (pg_catalog.to_timestamp((ev->>'timestamp')::numeric/1000)
      at time zone 'Europe/London')::date=p_day
 and (pg_catalog.to_timestamp((ev->>'timestamp')::numeric/1000)
      at time zone 'Europe/London')::time<=p_cutoff
),
marked as (
 select s.emp_id,s.emp_name,s.site_id,w.site_name,
 (s.emp_id in(select emp_id from approved_leave)) as on_leave,
 (s.emp_id in(select emp_id from recorded_absence)) as away,
 (s.emp_id in(select emp_id from clockins)) as clocked,
 (s.custom_start is not null and
  s.custom_start ~ '^[0-2][0-9]:[0-5][0-9]$' and
  s.custom_start::time>p_cutoff) as starts_later
 from active_staff s join workshops w on w.site_id=s.site_id
),
grouped as (
 select m.site_id,m.site_name,
 count(*) as active,
 count(*) filter(where m.on_leave or m.away) as excused,
 count(*) filter(where m.starts_later and not(m.on_leave or m.away)) as scheduled_later,
 count(*) filter(where m.clocked and not(m.on_leave or m.away or m.starts_later)) as clocked,
 count(*) filter(where not(m.on_leave or m.away or m.starts_later or m.clocked)) as missing,
 coalesce(pg_catalog.jsonb_agg(m.emp_name order by m.emp_name)
   filter(where not(m.on_leave or m.away or m.starts_later or m.clocked)),'[]'::jsonb) as missing_names
 from marked m group by m.site_id,m.site_name
)
select pg_catalog.jsonb_build_object(
 'date',p_day::text,'check_time_uk',p_cutoff::text,
 'total_active_workshop_staff',coalesce((select sum(active) from grouped),0),
 'total_recorded_excused',coalesce((select sum(excused) from grouped),0),
 'total_recorded_later_start',coalesce((select sum(scheduled_later) from grouped),0),
 'total_clocked_in',coalesce((select sum(clocked) from grouped),0),
 'total_not_clocked_in',coalesce((select sum(missing) from grouped),0),
 'branches',coalesce((select pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('site',site_name,'site_id',site_id,'not_clocked_in',missing,
   'names',missing_names,'checked_in',clocked,'excused',excused,'later_start',scheduled_later)
  order by site_id) from grouped),'[]'::jsonb),
 'qualification','No clock-in is recorded as of the stated time. This does not establish absence; Shiftboard does not record a complete rota or all non-working days.'
);
$fn$;
revoke all on function public.internal_workshop_morning_clockins(date,time without time zone)
from public,anon,authenticated;
comment on function public.internal_workshop_morning_clockins(date,time without time zone) is
 'Privileged backend-only UK 08:40 attendance snapshot for the weekday email to Tony and Neil. Does not label missing as absent.';
