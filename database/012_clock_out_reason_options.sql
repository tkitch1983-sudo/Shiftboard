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

  select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','name',e->>'name') order by e->>'name'),'[]'::jsonb)
    into v_cover_staff
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'siteId'=v_emp->>'siteId'
    and e->>'id'<>v_emp->>'id'
    and coalesce((e->>'active')::boolean,true);

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
