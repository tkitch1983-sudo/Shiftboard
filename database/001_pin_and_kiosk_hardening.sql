-- Keep staff PINs at exactly four digits while protecting every public kiosk action.
alter table public.pin_attempts
  add column if not exists pin_fingerprint text,
  add column if not exists action text;

create index if not exists pin_attempts_recent_idx
  on public.pin_attempts (attempted_at desc);
create index if not exists pin_attempts_fingerprint_recent_idx
  on public.pin_attempts (pin_fingerprint, attempted_at desc)
  where succeeded = false;

create or replace function public.pin_guard(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fingerprint text := encode(digest(coalesce(p_pin, ''), 'sha256'), 'hex');
  v_pin_failures integer;
  v_global_failures integer;
begin
  delete from public.pin_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_pin_failures
  from public.pin_attempts
  where succeeded = false
    and pin_fingerprint = v_fingerprint
    and attempted_at > now() - interval '15 minutes';

  select count(*) into v_global_failures
  from public.pin_attempts
  where succeeded = false
    and attempted_at > now() - interval '15 minutes';

  if v_pin_failures >= 5 or v_global_failures >= 40 then
    raise exception 'Too many incorrect PIN attempts. Please wait 15 minutes and try again.';
  end if;
end;
$$;

create or replace function public.pin_record(p_pin text, p_ok boolean, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.pin_attempts (succeeded, pin_fingerprint, action)
  values (p_ok, encode(digest(coalesce(p_pin, ''), 'sha256'), 'hex'), left(coalesce(p_action, 'unknown'), 40));
end;
$$;

create or replace function public.staff_lookup(p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg jsonb; v_emp jsonb;
begin
  if p_pin !~ '^[0-9]{4}$' then return null; end if;
  perform public.pin_guard(p_pin);

  select value into v_cfg from public.shift_board where key = 'config';
  select e into v_emp
  from jsonb_array_elements(coalesce(v_cfg->'employees', '[]'::jsonb)) e
  where e->>'pin' = p_pin and coalesce((e->>'active')::boolean, true)
  limit 1;

  if v_emp is null then
    perform public.pin_record(p_pin, false, 'lookup');
    return null;
  end if;

  perform public.pin_record(p_pin, true, 'lookup');
  return json_build_object(
    'id', v_emp->>'id', 'name', v_emp->>'name', 'siteId', v_emp->>'siteId',
    'mustChangePin', coalesce((v_emp->>'mustChangePin')::boolean, false)
  );
end;
$$;

create or replace function public.staff_clock(p_pin text, p_site_id text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb; v_emp jsonb; v_emp_id text; v_site_id text;
  v_events jsonb; v_last jsonb; v_type text; v_event jsonb; v_id text;
begin
  if p_pin !~ '^[0-9]{4}$' then return null; end if;
  perform public.pin_guard(p_pin);

  select value into v_cfg from public.shift_board where key = 'config' for share;
  select e into v_emp
  from jsonb_array_elements(coalesce(v_cfg->'employees', '[]'::jsonb)) e
  where e->>'pin' = p_pin and coalesce((e->>'active')::boolean, true)
  limit 1;
  if v_emp is null then
    perform public.pin_record(p_pin, false, 'clock');
    return null;
  end if;

  v_emp_id := v_emp->>'id';
  select case when exists (
    select 1 from jsonb_array_elements(coalesce(v_cfg->'sites', '[]'::jsonb)) s
    where s->>'id' = p_site_id
  ) then p_site_id else v_emp->>'siteId' end into v_site_id;

  insert into public.shift_board(key, value) values ('clockEvents', '[]'::jsonb)
  on conflict (key) do nothing;
  select coalesce(value, '[]'::jsonb) into v_events
  from public.shift_board where key = 'clockEvents' for update;

  select e into v_last
  from jsonb_array_elements(v_events) e
  where e->>'employeeId' = v_emp_id
  order by (e->>'timestamp')::bigint desc limit 1;
  v_type := case when v_last is not null and v_last->>'type' = 'in' then 'out' else 'in' end;
  v_id := md5(random()::text || clock_timestamp()::text);
  v_event := jsonb_build_object(
    'id', v_id, 'employeeId', v_emp_id, 'type', v_type,
    'timestamp', (extract(epoch from now()) * 1000)::bigint, 'siteId', v_site_id
  );
  update public.shift_board set value = v_events || jsonb_build_array(v_event) where key = 'clockEvents';
  perform public.pin_record(p_pin, true, 'clock');
  return json_build_object('id',v_id,'name',v_emp->>'name','type',v_type,'timestamp',v_event->>'timestamp');
end;
$$;

create or replace function public.staff_request_holiday(p_pin text, p_dates jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg jsonb; v_emp jsonb; v_requests jsonb; v_request jsonb;
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

  insert into public.shift_board(key,value) values ('holidayRequests','[]'::jsonb)
  on conflict (key) do nothing;
  select coalesce(value,'[]'::jsonb) into v_requests from public.shift_board where key='holidayRequests' for update;
  v_request := jsonb_build_object(
    'id',md5(random()::text||clock_timestamp()::text),'employeeId',v_emp->>'id',
    'dates',p_dates,'status','pending','requestedAt',(extract(epoch from now())*1000)::bigint,
    'localDateV2',true
  );
  update public.shift_board set value=v_requests||jsonb_build_array(v_request) where key='holidayRequests';
  perform public.pin_record(p_pin,true,'holiday');
  return json_build_object('ok',true,'days',jsonb_array_length(p_dates));
end;
$$;

create or replace function public.staff_set_pin(p_pin text, p_new_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg jsonb; v_emp jsonb; v_emp_id text; v_taken integer;
begin
  if p_pin !~ '^[0-9]{4}$' then return json_build_object('ok',false,'error','Current PIN not recognised'); end if;
  if p_new_pin !~ '^[0-9]{4}$' then return json_build_object('ok',false,'error','PIN must be exactly 4 digits'); end if;
  perform public.pin_guard(p_pin);
  select value into v_cfg from public.shift_board where key='config' for update;
  select e into v_emp from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_pin and coalesce((e->>'active')::boolean,true) limit 1;
  if v_emp is null then
    perform public.pin_record(p_pin,false,'set_pin');
    return json_build_object('ok',false,'error','Current PIN not recognised');
  end if;
  v_emp_id := v_emp->>'id';
  select count(*) into v_taken from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_new_pin and e->>'id'<>v_emp_id;
  if v_taken>0 then return json_build_object('ok',false,'error','That PIN is already taken — pick another'); end if;
  if p_new_pin=p_pin then return json_build_object('ok',false,'error','Please choose a different PIN from the one you were given'); end if;
  v_cfg := jsonb_set(v_cfg,'{employees}',(
    select jsonb_agg(case when e->>'id'=v_emp_id
      then jsonb_set(jsonb_set(e,'{pin}',to_jsonb(p_new_pin)),'{mustChangePin}','false'::jsonb) else e end)
    from jsonb_array_elements(v_cfg->'employees') e
  ));
  update public.shift_board set value=v_cfg where key='config';
  perform public.pin_record(p_pin,true,'set_pin');
  return json_build_object('ok',true);
end;
$$;

-- Photo rows carry the physical kiosk site for enforceable manager scoping.
alter table public.clock_photos add column if not exists site_id text;

create or replace function public.staff_clock_photo(p_pin text, p_event_id text, p_image text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg jsonb; v_emp jsonb; v_events jsonb; v_event jsonb; v_site_id text;
begin
  if p_pin !~ '^[0-9]{4}$' then return json_build_object('ok',false); end if;
  perform public.pin_guard(p_pin);
  if p_image is null or length(p_image)>400000 or p_image not like 'data:image/jpeg;base64,%' then
    return json_build_object('ok',false,'error','image missing, invalid or too large');
  end if;
  select value into v_cfg from public.shift_board where key='config';
  select e into v_emp from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_pin and coalesce((e->>'active')::boolean,true) limit 1;
  if v_emp is null then perform public.pin_record(p_pin,false,'photo'); return json_build_object('ok',false); end if;
  select coalesce(value,'[]'::jsonb) into v_events from public.shift_board where key='clockEvents';
  select ev into v_event from jsonb_array_elements(v_events) ev
  where ev->>'id'=p_event_id and ev->>'employeeId'=v_emp->>'id' limit 1;
  if v_event is null then return json_build_object('ok',false,'error','event does not belong to this employee'); end if;
  v_site_id := coalesce(v_event->>'siteId',v_emp->>'siteId');
  insert into public.clock_photos(event_id,employee_id,site_id,image)
  values(p_event_id,v_emp->>'id',v_site_id,p_image)
  on conflict(event_id) do update set image=excluded.image,employee_id=excluded.employee_id,site_id=excluded.site_id;
  perform public.pin_record(p_pin,true,'photo');
  return json_build_object('ok',true);
end;
$$;

update public.clock_photos p
set site_id = coalesce(
  (select e->>'siteId' from public.shift_board s, jsonb_array_elements(s.value) e
   where s.key='clockEvents' and e->>'id'=p.event_id limit 1),
  (select e->>'siteId' from public.shift_board s, jsonb_array_elements(s.value->'employees') e
   where s.key='config' and e->>'id'=p.employee_id limit 1)
)
where p.site_id is null;

revoke all on function public.pin_guard(text) from public, anon, authenticated;
revoke all on function public.pin_record(text,boolean,text) from public, anon, authenticated;
revoke all on function public.staff_lookup(text) from public;
revoke all on function public.staff_clock(text,text) from public;
revoke all on function public.staff_request_holiday(text,jsonb) from public;
revoke all on function public.staff_set_pin(text,text) from public;
revoke all on function public.staff_clock_photo(text,text,text) from public;
grant execute on function public.staff_lookup(text) to anon, authenticated;
grant execute on function public.staff_clock(text,text) to anon, authenticated;
grant execute on function public.staff_request_holiday(text,jsonb) to anon, authenticated;
grant execute on function public.staff_set_pin(text,text) to anon, authenticated;
grant execute on function public.staff_clock_photo(text,text,text) to anon, authenticated;

drop function if exists public.pin_guard();
drop function if exists public.pin_record(boolean);
