-- Add Z Alexander as an approved shift-cover option for Peterlee Filling Station.
-- Peterlee Filling Station is currently named ETAC Petrol in the live site list.

create or replace function public.staff_lookup(p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb;
  v_emp jsonb;
  v_cover_staff jsonb;
  v_events jsonb;
  v_last jsonb;
  v_clock_status text := 'out';
  v_last_ts timestamptz;
  v_site_name text;
begin
  if p_pin !~ '^[0-9]{4}$' then return null; end if;
  perform public.pin_guard(p_pin);

  select value into v_cfg from public.shift_board where key='config';
  select e into v_emp
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_pin and coalesce((e->>'active')::boolean,true)
  limit 1;

  if v_emp is null then
    perform public.pin_record(p_pin,false,'lookup');
    return null;
  end if;

  select lower(coalesce(s->>'name','')) into v_site_name
  from jsonb_array_elements(coalesce(v_cfg->'sites','[]'::jsonb)) s
  where s->>'id'=v_emp->>'siteId'
  limit 1;

  with cover_candidates as (
    select e->>'id' as id, e->>'name' as name
    from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
    where e->>'siteId'=v_emp->>'siteId'
      and e->>'id'<>v_emp->>'id'
      and coalesce((e->>'active')::boolean,true)
    union
    select m->>'id' as id, m->>'name' as name
    from jsonb_array_elements(coalesce(v_cfg->'siteManagers','[]'::jsonb)) m
    where (
        coalesce(v_site_name,'') like '%etac petrol%'
        or coalesce(v_site_name,'') like '%peterlee filling%'
        or coalesce(v_site_name,'') like '%peterlee convenience%'
      )
      and m->>'siteId'=v_emp->>'siteId'
      and coalesce((m->>'active')::boolean,true)
      and lower(trim(coalesce(m->>'name','')))='z alexander'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb)
    into v_cover_staff
  from cover_candidates;

  select coalesce(value,'[]'::jsonb) into v_events
  from public.shift_board where key='clockEvents';

  select ev into v_last
  from jsonb_array_elements(v_events) ev
  where ev->>'employeeId'=v_emp->>'id'
  order by (ev->>'timestamp')::bigint desc
  limit 1;

  if v_last is not null and v_last->>'type'='in' then
    v_last_ts := to_timestamp((v_last->>'timestamp')::bigint / 1000.0);
    if (v_last_ts at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date then
      v_clock_status := 'in';
    end if;
  end if;

  perform public.pin_record(p_pin,true,'lookup');
  return json_build_object(
    'id',v_emp->>'id',
    'name',v_emp->>'name',
    'siteId',v_emp->>'siteId',
    'mustChangePin',coalesce((v_emp->>'mustChangePin')::boolean,false),
    'coverStaff',v_cover_staff,
    'clockStatus',v_clock_status
  );
end;
$$;

create or replace function public.staff_request_holiday(p_pin text, p_dates jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb;
  v_emp jsonb;
  v_cover jsonb;
  v_cover_id text;
  v_site_name text;
  v_is_filling boolean;
  v_is_peterlee boolean;
  v_clean_dates jsonb;
  v_requests jsonb;
  v_request jsonb;
begin
  if p_pin !~ '^[0-9]{4}$' then return null; end if;
  perform public.pin_guard(p_pin);
  select value into v_cfg from public.shift_board where key='config' for share;
  select e into v_emp from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_pin and coalesce((e->>'active')::boolean,true) limit 1;
  if v_emp is null then perform public.pin_record(p_pin,false,'holiday'); return null; end if;

  if p_dates is null or jsonb_typeof(p_dates) <> 'array' or jsonb_array_length(p_dates) not between 1 and 31 then
    return json_build_object('ok',false,'error','Choose between 1 and 31 holiday dates');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_dates) d
    where coalesce(d->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
       or coalesce((d->>'amount')::numeric,0) <= 0
       or coalesce((d->>'amount')::numeric,0) > 24
  ) then return json_build_object('ok',false,'error','Invalid holiday dates or hours'); end if;

  select lower(coalesce(s->>'name','')) into v_site_name
  from jsonb_array_elements(coalesce(v_cfg->'sites','[]'::jsonb)) s
  where s->>'id'=v_emp->>'siteId' limit 1;

  v_is_peterlee := coalesce(v_site_name,'') like '%etac petrol%'
    or coalesce(v_site_name,'') like '%peterlee filling%'
    or coalesce(v_site_name,'') like '%peterlee convenience%';
  v_is_filling := coalesce(v_site_name,'') like '%great ayton%' or v_is_peterlee;

  v_cover_id := nullif(p_dates->0->>'coverEmployeeId','');
  if v_is_filling then
    select e into v_cover
    from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
    where e->>'id'=v_cover_id
      and e->>'id'<>v_emp->>'id'
      and e->>'siteId'=v_emp->>'siteId'
      and coalesce((e->>'active')::boolean,true)
    limit 1;

    if v_cover is null and v_is_peterlee then
      select m into v_cover
      from jsonb_array_elements(coalesce(v_cfg->'siteManagers','[]'::jsonb)) m
      where m->>'id'=v_cover_id
        and m->>'siteId'=v_emp->>'siteId'
        and coalesce((m->>'active')::boolean,true)
        and lower(trim(coalesce(m->>'name','')))='z alexander'
      limit 1;
    end if;

    if v_cover is null then
      return json_build_object('ok',false,'error','Choose an active colleague from your station to cover the shift');
    end if;
  else
    v_cover_id := null;
    v_cover := null;
  end if;

  select jsonb_agg(d - 'coverEmployeeId') into v_clean_dates
  from jsonb_array_elements(p_dates) d;

  insert into public.shift_board(key,value) values ('holidayRequests','[]'::jsonb)
  on conflict (key) do nothing;
  select coalesce(value,'[]'::jsonb) into v_requests from public.shift_board where key='holidayRequests' for update;
  v_request := jsonb_build_object(
    'id',md5(random()::text||clock_timestamp()::text),'employeeId',v_emp->>'id',
    'dates',v_clean_dates,'status','pending','requestedAt',(extract(epoch from now())*1000)::bigint,
    'localDateV2',true
  );
  if v_cover is not null then
    v_request := v_request || jsonb_build_object('coverEmployeeId',v_cover_id,'coverEmployeeName',v_cover->>'name');
  end if;
  update public.shift_board set value=v_requests||jsonb_build_array(v_request) where key='holidayRequests';
  perform public.pin_record(p_pin,true,'holiday');
  return json_build_object('ok',true,'days',jsonb_array_length(v_clean_dates));
end;
$$;
