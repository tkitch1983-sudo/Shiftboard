create or replace function public.monthly_hs_for_pin(p_site_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_check public.monthly_hs_checks%rowtype;
  v_emp jsonb;
  v_ack timestamptz;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok',false,'message','PIN not recognised.');
  end if;

  perform public.pin_guard(p_pin);

  select * into v_check
  from public.monthly_hs_checks
  where site_id=p_site_id
    and month_start=date_trunc('month',current_date)::date
    and status='published'
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'message','This month''s H&S checks have not been published yet.');
  end if;

  select e into v_emp
  from jsonb_array_elements(
    coalesce((select value->'employees' from public.shift_board where key='config'),'[]'::jsonb)
  ) e
  where coalesce((e->>'active')::boolean,true)
    and coalesce(e->>'siteId','')=p_site_id
    and coalesce(e->>'pin','')=p_pin
  limit 1;

  if v_emp is null then
    perform public.pin_record(p_pin,false,'monthly_hs_open');
    return jsonb_build_object('ok',false,'message','PIN not recognised for this site.');
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_check.expected_staff,'[]'::jsonb)) s
    where s->>'id'=v_emp->>'id'
  ) then
    perform public.pin_record(p_pin,true,'monthly_hs_open');
    return jsonb_build_object('ok',false,'message','You are not on this month''s acknowledgement list. Please ask your manager.');
  end if;

  select acknowledged_at into v_ack
  from public.monthly_hs_acknowledgements
  where check_id=v_check.id
    and revision=v_check.revision
    and employee_id=v_emp->>'id'
  limit 1;

  perform public.pin_record(p_pin,true,'monthly_hs_open');
  return jsonb_build_object(
    'ok',true,
    'check_id',v_check.id,
    'site_id',v_check.site_id,
    'month_start',v_check.month_start,
    'revision',v_check.revision,
    'employee_id',v_emp->>'id',
    'employee_name',v_emp->>'name',
    'checks',v_check.checks,
    'manager_notes',v_check.manager_notes,
    'published_at',v_check.published_at,
    'acked',v_ack is not null,
    'acknowledged_at',v_ack
  );
end;
$$;

create or replace function public.monthly_hs_acknowledge(p_check_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_check public.monthly_hs_checks%rowtype;
  v_emp jsonb;
  v_when timestamptz;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok',false,'message','PIN not recognised.');
  end if;

  perform public.pin_guard(p_pin);

  select * into v_check
  from public.monthly_hs_checks
  where id=p_check_id
    and status='published'
    and month_start=date_trunc('month',current_date)::date
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'message','This monthly H&S check is not available.');
  end if;

  select e into v_emp
  from jsonb_array_elements(
    coalesce((select value->'employees' from public.shift_board where key='config'),'[]'::jsonb)
  ) e
  where coalesce((e->>'active')::boolean,true)
    and coalesce(e->>'siteId','')=v_check.site_id
    and coalesce(e->>'pin','')=p_pin
  limit 1;

  if v_emp is null then
    perform public.pin_record(p_pin,false,'monthly_hs_ack');
    return jsonb_build_object('ok',false,'message','PIN not recognised for this site.');
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_check.expected_staff,'[]'::jsonb)) s
    where s->>'id'=v_emp->>'id'
  ) then
    perform public.pin_record(p_pin,true,'monthly_hs_ack');
    return jsonb_build_object('ok',false,'message','You are not on this month''s acknowledgement list. Please ask your manager.');
  end if;

  insert into public.monthly_hs_acknowledgements(
    check_id,revision,site_id,month_start,employee_id,employee_name
  ) values (
    v_check.id,v_check.revision,v_check.site_id,v_check.month_start,v_emp->>'id',v_emp->>'name'
  )
  on conflict(check_id,revision,employee_id) do update
    set employee_name=excluded.employee_name
  returning acknowledged_at into v_when;

  if v_when is null then
    select acknowledged_at into v_when
    from public.monthly_hs_acknowledgements
    where check_id=v_check.id and revision=v_check.revision and employee_id=v_emp->>'id';
  end if;

  perform public.pin_record(p_pin,true,'monthly_hs_ack');
  return jsonb_build_object(
    'ok',true,
    'employee_id',v_emp->>'id',
    'employee_name',v_emp->>'name',
    'acknowledged_at',v_when,
    'revision',v_check.revision
  );
end;
$$;

revoke all on function public.monthly_hs_for_pin(text,text) from public;
revoke all on function public.monthly_hs_acknowledge(uuid,text) from public;
grant execute on function public.monthly_hs_for_pin(text,text) to anon, authenticated;
grant execute on function public.monthly_hs_acknowledge(uuid,text) to anon, authenticated;
