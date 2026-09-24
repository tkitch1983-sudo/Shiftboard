create or replace function public.staff_clock_v2(p_pin text, p_site_id text, p_out_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res json;
  v_reason text;
  v_event_id text;
begin
  v_reason := case lower(trim(coalesce(p_out_reason,'')))
    when 'dinner' then 'dinner'
    when 'end_shift' then 'end_shift'
    when 'travel' then 'travel'
    else null
  end;

  v_res := public.staff_clock(p_pin, p_site_id);
  if v_res is null then return null; end if;

  if v_res->>'type'='out' then
    if v_reason is null then v_reason := 'end_shift'; end if;
    v_event_id := v_res->>'id';

    update public.shift_board
    set value = coalesce((
      select jsonb_agg(
        case when ev->>'id'=v_event_id
          then ev || jsonb_build_object('outReason',v_reason)
          else ev
        end
      )
      from jsonb_array_elements(coalesce(value,'[]'::jsonb)) ev
    ), '[]'::jsonb)
    where key='clockEvents';

    return (v_res::jsonb || jsonb_build_object('outReason',v_reason))::json;
  end if;

  return v_res;
end;
$$;

revoke all on function public.staff_clock_v2(text,text,text) from public;
grant execute on function public.staff_clock_v2(text,text,text) to anon, authenticated;

create or replace function public.sales_ytd_same_date(p_snapshot_date date default null)
returns table(
  site_name text,
  snapshot_date date,
  current_year integer,
  prior_year integer,
  ytd_current numeric,
  ytd_prior numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snap date;
  v_year integer;
  v_month_start date;
  v_cur_year_start date;
  v_prior_year_start date;
  v_prior_month_start date;
  v_role text;
begin
  v_role := coalesce(auth.jwt()->'app_metadata'->>'role','');
  if v_role not in ('super','site') then
    raise exception 'Management access required';
  end if;

  select max(s.snapshot_date)
    into v_snap
  from public.sales_daily_snapshots s
  where p_snapshot_date is null or s.snapshot_date <= p_snapshot_date;

  if v_snap is null then return; end if;

  v_year := extract(year from v_snap)::integer;
  v_month_start := date_trunc('month',v_snap)::date;
  v_cur_year_start := make_date(v_year,1,1);
  v_prior_year_start := make_date(v_year-1,1,1);
  v_prior_month_start := make_date(v_year-1,extract(month from v_snap)::integer,1);

  return query
  with latest as (
    select distinct on (s.site_name)
      s.site_name,
      s.total_current::numeric as mtd_current,
      s.total_prior::numeric as mtd_prior,
      s.comparison_available
    from public.sales_daily_snapshots s
    where s.snapshot_date = v_snap
    order by s.site_name, s.updated_at desc nulls last, s.created_at desc nulls last
  ), current_full as (
    select a.site_name, sum(a.total_net)::numeric as total
    from public.site_sales_analysis_monthly a
    where a.month_start >= v_cur_year_start
      and a.month_start < v_month_start
    group by a.site_name
  ), prior_full as (
    select a.site_name, sum(a.total_net)::numeric as total
    from public.site_sales_analysis_monthly a
    where a.month_start >= v_prior_year_start
      and a.month_start < v_prior_month_start
    group by a.site_name
  )
  select
    l.site_name,
    v_snap,
    v_year,
    v_year-1,
    (coalesce(c.total,0)+coalesce(l.mtd_current,0))::numeric,
    case
      when l.comparison_available and p.site_name is not null
      then (coalesce(p.total,0)+coalesce(l.mtd_prior,0))::numeric
      else null
    end
  from latest l
  left join current_full c on c.site_name=l.site_name
  left join prior_full p on p.site_name=l.site_name
  order by l.site_name;
end;
$$;

revoke all on function public.sales_ytd_same_date(date) from public, anon;
grant execute on function public.sales_ytd_same_date(date) to authenticated;
