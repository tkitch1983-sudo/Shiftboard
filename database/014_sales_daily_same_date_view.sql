create or replace function public.sales_daily_same_date(p_snapshot_date date default null)
returns table(
  site_name text,
  snapshot_date date,
  current_year integer,
  prior_year integer,
  daily_current numeric,
  daily_prior numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snap date;
  v_month_start date;
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
  v_month_start := date_trunc('month',v_snap)::date;

  return query
  with today_rows as (
    select distinct on (s.site_name)
      s.site_name,
      s.total_current::numeric as total_current,
      s.total_prior::numeric as total_prior,
      s.comparison_available
    from public.sales_daily_snapshots s
    where s.snapshot_date=v_snap
    order by s.site_name, s.updated_at desc nulls last, s.created_at desc nulls last
  ), prev_rows as (
    select distinct on (s.site_name)
      s.site_name,
      s.total_current::numeric as total_current,
      s.total_prior::numeric as total_prior
    from public.sales_daily_snapshots s
    where s.snapshot_date=v_snap-1
    order by s.site_name, s.updated_at desc nulls last, s.created_at desc nulls last
  )
  select
    t.site_name,
    v_snap,
    extract(year from v_snap)::integer,
    extract(year from v_snap)::integer-1,
    case
      when v_snap=v_month_start then t.total_current
      when p.site_name is null then null
      else t.total_current-p.total_current
    end as daily_current,
    case
      when not t.comparison_available or t.total_prior is null then null
      when v_snap=v_month_start then t.total_prior
      when p.site_name is null or p.total_prior is null then null
      else t.total_prior-p.total_prior
    end as daily_prior
  from today_rows t
  left join prev_rows p on p.site_name=t.site_name
  order by t.site_name;
end;
$$;

revoke all on function public.sales_daily_same_date(date) from public, anon;
grant execute on function public.sales_daily_same_date(date) to authenticated;
