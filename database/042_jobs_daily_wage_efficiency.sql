-- Management-only, read-only, daily workshop wage estimates.
-- Replicates the completed-day method of Tony Dashboard in index.html.
-- Does NOT grant payroll data to browsers; never returns employee names/rates.
-- Accurate as a payroll estimate only, not as actual net profit.
create or replace function public.internal_jobs_daily_wage_snapshot(p_day date)
returns table (
 site_key text, site_name text, report_date date,
 scheduled_hours numeric, worked_hours numeric,
 estimated_scheduled_wages numeric, estimated_worked_wages numeric,
 estimated_wages_saved numeric, active_staff integer,
 recorded_worked_staff integer, missing_pay_rates integer,
 auto_closed_shifts integer, timesheet_overrides integer,
 job_count integer, day_sheet_sales_ex_vat numeric,
 wage_cost_per_job numeric, sales_less_direct_wages numeric
)
language sql stable security definer set search_path = ''
as $fn$
with
cfg as (
 select value as config from public.shift_board where key='config'
),
settings as (
 select config->'settings' as s,config->'bankHolidays' as holidays from cfg
),
sites(site_id,site_key,rollout) as (
 values
 ('s1','seaham',date '2026-09-15'),
 ('s2','peterlee',date '2026-09-22'),
 ('s3','middlesbrough',date '2026-09-08'),
 ('s4','hartlepool',date '2026-09-10'),
 ('s5','gateshead',date '2026-09-22'),
 ('s6','fairfield',date '2026-09-22'),
 ('s7','chester-le-street',date '2026-09-22'),
 ('s8','lido',date '2026-09-10')
),
site_conf as (
 select s.site_id,s.site_key,s.rollout,
        c->>'name' site_name,c as site_json,
        (c->>'tradingPattern'='sevenDay') as seven_day,
        (c->>'noSaturday'='true') as no_saturday
 from sites s
 left join cfg v on true
 left join lateral pg_catalog.jsonb_array_elements(v.config->'sites') c
 on c->>'id'=s.site_id
),
staff as (
 select e->>'id' emp_id,e->>'siteId' site_id,
        e->>'customStart' custom_start,e->>'customEnd' custom_end,
        coalesce(e->>'noLunchBreak','false')='true' no_lunch,
        p.pay_rate as rate
 from cfg v
 cross join lateral pg_catalog.jsonb_array_elements(v.config->'employees') e
 left join public.staff_pay_rates p on p.employee_id=e->>'id'
 where coalesce(e->>'active','true')='true'
 and e->>'siteId' in (select site_id from sites)
),
schedule as (
 select e.*, sc.site_key,sc.site_name,
 case
 when p_day < sc.rollout then null
 when extract(isodow from p_day)=7 and not sc.seven_day then null
 when extract(isodow from p_day)=6 and sc.no_saturday then null
 when extract(isodow from p_day) between 1 and 5 and not sc.seven_day
      and exists(select 1 from settings t where t.holidays ? (p_day::text)) then null
 when extract(isodow from p_day)=6 then
   coalesce(nullif(sc.site_json->'hours'->>'saturdayStart',''),
            nullif((select s->>'saturdayStart' from settings),''),
            '08:30')
 when extract(isodow from p_day)=7 then
   coalesce(nullif(sc.site_json->'hours'->>'sundayStart',''),
            nullif((select s->>'sundayStart' from settings),''),
            '08:00')
 else coalesce(nullif(e.custom_start,''),
               nullif(sc.site_json->'hours'->>'weekdayStart',''),
               nullif((select s->>'weekdayStart' from settings),''),
               '08:30') end as start_str,
 case
 when p_day < sc.rollout then null
 when extract(isodow from p_day)=7 and not sc.seven_day then null
 when extract(isodow from p_day)=6 and sc.no_saturday then null
 when extract(isodow from p_day) between 1 and 5 and not sc.seven_day
      and exists(select 1 from settings t where t.holidays ? (p_day::text)) then null
 when extract(isodow from p_day)=6 then
   coalesce(nullif(sc.site_json->'hours'->>'saturdayEnd',''),
            nullif((select s->>'saturdayEnd' from settings),''),
            '13:00')
 when extract(isodow from p_day)=7 then
   coalesce(nullif(sc.site_json->'hours'->>'sundayEnd',''),
            nullif((select s->>'sundayEnd' from settings),''),
            '20:00')
 else coalesce(nullif(e.custom_end,''),
               nullif(sc.site_json->'hours'->>'weekdayEnd',''),
               nullif((select s->>'weekdayEnd' from settings),''),
               '17:30') end as end_str
 from staff e join site_conf sc on sc.site_id=e.site_id
),
time_windows as (
 select e.*,
    case when start_str ~ '^[0-2][0-9]:[0-5][0-9]$'
      then p_day::timestamp+(start_str::time-time '00:00')
      else null end as start_at,
    case when end_str ~ '^[0-2][0-9]:[0-5][0-9]$'
      then p_day::timestamp+(end_str::time-time '00:00')
      else null end as end_at
 from schedule e
),
leave as (
 select distinct h->>'employeeId' emp_id from public.shift_board b
 cross join lateral pg_catalog.jsonb_array_elements(b.value) h
 cross join lateral pg_catalog.jsonb_array_elements(
  case when pg_catalog.jsonb_typeof(h->'dates')='array' then h->'dates' else '[]'::jsonb end) d
 where b.key='holidayRequests' and h->>'status'='approved'
 and d->>'date'=p_day::text
),
absent as (
 select distinct a->>'employeeId' emp_id from public.shift_board b
 cross join lateral pg_catalog.jsonb_array_elements(b.value) a
 where b.key='absences' and (a->>'date')=p_day::text
),
eligible as (
 select w.*,
 case when start_at is not null and end_at is not null and end_at>start_at
 then round(greatest(0,
      extract(epoch from (end_at-start_at))/3600.0
      - case when extract(isodow from p_day) between 1 and 5 and not no_lunch then 0.5 else 0 end
      )::numeric*4)/4.0
 else 0::numeric end scheduled_hrs,
 (w.emp_id in (select emp_id from leave)
  or w.emp_id in (select emp_id from absent)) is_excused
 from time_windows w
),
events_all as (
 select ev->>'employeeId' emp_id,
        ev->>'type' typ,
        (ev->>'timestamp')::numeric as ms,
        pg_catalog.to_timestamp((ev->>'timestamp')::numeric/1000)
           at time zone 'Europe/London' as local_time
 from public.shift_board b
 cross join lateral pg_catalog.jsonb_array_elements(b.value) ev
 where b.key='clockEvents'
 and ev->>'type' in ('in','out')
 and ev ? 'timestamp'
),
next_events as (
 select emp_id, typ, local_time,
  lead(typ) over(partition by emp_id order by ms) next_type,
  lead(local_time) over(partition by emp_id order by ms) next_local
 from events_all
),
in_shifts as (
 select n.emp_id,n.local_time as clock_in,
 case when n.next_type='out' and n.next_local >= n.local_time
   then n.next_local else p_day::timestamp+time '18:30' end as clock_out,
 not(n.next_type='out' and n.next_local >= n.local_time) as auto_closed,
 row_number() over(partition by n.emp_id order by n.local_time) as shift_no
 from next_events n
 where n.typ='in' and n.local_time::date=p_day
),
clamped_shifts as (
 select sh.emp_id,sh.auto_closed,
  -- In at 08:31 or later rounds UP to the next quarter-hour on the first shift.
  case when sh.shift_no=1 and sh.clock_in >= e.start_at+interval '1 minute'
       then greatest(e.start_at,
            pg_catalog.to_timestamp(
              ceiling(extract(epoch from sh.clock_in)/900.0)*900
            ) at time zone 'UTC')
       else greatest(sh.clock_in,e.start_at) end as paid_in,
  least(sh.clock_out,e.end_at) as paid_out
 from in_shifts sh join eligible e on e.emp_id=sh.emp_id
 where e.start_at is not null and e.end_at is not null
),
valid_shifts as (
 select emp_id,auto_closed,paid_in,greatest(paid_in,paid_out) paid_out
 from clamped_shifts
),
ordered as (
 select emp_id,auto_closed,paid_in,paid_out,
 lag(paid_out) over(partition by emp_id order by paid_in,paid_out) previous_out
 from valid_shifts
),
day_clock as (
 select emp_id,
 coalesce(sum(extract(epoch from (paid_out-paid_in))/3600.0),0)::numeric clock_hrs,
 coalesce(sum(case when previous_out is not null and paid_in>previous_out
     then extract(epoch from (paid_in-previous_out))/3600.0 else 0 end),0)::numeric break_hrs,
 count(*) filter(where auto_closed)::integer auto_closed_shifts
 from ordered group by emp_id
),
overrides as (
 select e.emp_id,
  b.value #>> array[
   (p_day-(extract(isodow from p_day)::integer-1))::text,
   'employees',e.emp_id,'hoursOverride',p_day::text
  ] as hours_override
 from eligible e
 left join public.shift_board b on b.key='timesheetExtras'
),
day_paid as (
 select e.*,
 coalesce(c.auto_closed_shifts,0) as auto_closed_shifts,
 case when o.hours_override is not null
           and trim(o.hours_override) ~ '^[0-9]+(\.[0-9]+)?$'
      then true else false end as manual_override,
 -- The Tony Dashboard includes only a staff-day with recorded/overridden paid hours > 0.
 case when o.hours_override is not null
            and trim(o.hours_override) ~ '^[0-9]+(\.[0-9]+)?$'
      then round(o.hours_override::numeric*4)/4.0
      else round(greatest(0,
       coalesce(c.clock_hrs,0)
       - case when extract(isodow from p_day) between 1 and 5 and
                   coalesce(c.clock_hrs,0)>0 and not e.no_lunch
            then greatest(0,0.5-coalesce(c.break_hrs,0))
            else 0 end
      )*4)/4.0 end as actual_hrs
 from eligible e
 left join day_clock c on c.emp_id=e.emp_id
 left join overrides o on o.emp_id=e.emp_id
),
per_site as (
 select site_key,
 count(*)::integer active_staff,
 count(*) filter(where rate is null)::integer missing_rates,
 count(*) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null)::integer worked_staff,
 coalesce(sum(scheduled_hrs) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0) as planned_hours,
 coalesce(sum(actual_hrs) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0) as paid_hours,
 coalesce(sum(scheduled_hrs*rate) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0) as planned_wages,
 coalesce(sum(actual_hrs*rate) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0) as actual_wages,
 coalesce(sum((scheduled_hrs-actual_hrs)*rate) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0) as saving,
 coalesce(sum(auto_closed_shifts) filter(where actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null),0)::integer auto_closed,
 count(*) filter(where manual_override and actual_hrs>0 and not is_excused and scheduled_hrs>0 and rate is not null)::integer manual_overrides
 from day_paid
 group by site_key
)
select sc.site_key,sc.site_name,p_day,
 round(coalesce(p.planned_hours,0),2),
 round(coalesce(p.paid_hours,0),2),
 round(coalesce(p.planned_wages,0),2),
 round(coalesce(p.actual_wages,0),2),
 round(coalesce(p.saving,0),2),
 coalesce(p.active_staff,0),coalesce(p.worked_staff,0),
 coalesce(p.missing_rates,0),coalesce(p.auto_closed,0),coalesce(p.manual_overrides,0),
 j.total_jobs, j.net_sales_ex_vat,
 case when j.total_jobs>0 and coalesce(p.missing_rates,0)=0
 then round(p.actual_wages/j.total_jobs,2) else null end,
 case when j.net_sales_ex_vat is not null and coalesce(p.missing_rates,0)=0
 then round(j.net_sales_ex_vat-p.actual_wages,2) else null end
from site_conf sc
left join per_site p on p.site_key=sc.site_key
left join public.jobs_report_management j on j.site_key=sc.site_key and j.report_date=p_day
order by sc.site_id;
$fn$;
revoke all on function public.internal_jobs_daily_wage_snapshot(date) from public,anon,authenticated;
comment on function public.internal_jobs_daily_wage_snapshot(date) is
 'Restricted completed-day wage estimates following Tony Dashboard staff-day rules. Positive-clocked days only, absent/holiday skipped, no employer NI or pension. Current rates, not historic payroll. Aggregate site totals only.';
