create or replace function public.manager_reset_staff_pin(p_employee_id text, p_new_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_cfg jsonb;
  v_emp jsonb;
  v_emp_site text;
  v_taken integer;
begin
  if auth.uid() is null or v_role not in ('super','site') then
    raise exception 'Not authorised';
  end if;
  if coalesce(p_employee_id,'')='' then
    return json_build_object('ok',false,'error','Employee not supplied');
  end if;
  if p_new_pin !~ '^[0-9]{4}$' then
    return json_build_object('ok',false,'error','PIN must be exactly 4 digits');
  end if;

  select value into v_cfg from public.shift_board where key='config' for update;
  select e into v_emp
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'id'=p_employee_id
  limit 1;

  if v_emp is null then
    return json_build_object('ok',false,'error','Employee not found');
  end if;

  v_emp_site := coalesce(v_emp->>'siteId','');
  if v_role='site' and (v_site='' or v_emp_site<>v_site) then
    raise exception 'You can only reset PINs for staff at your own site';
  end if;

  select count(*) into v_taken
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'pin'=p_new_pin and e->>'id'<>p_employee_id;

  if v_taken>0 then
    return json_build_object('ok',false,'error','That PIN is already taken — choose another');
  end if;

  v_cfg := jsonb_set(v_cfg,'{employees}',(
    select jsonb_agg(
      case when e->>'id'=p_employee_id
        then jsonb_set(jsonb_set(e,'{pin}',to_jsonb(p_new_pin)),'{mustChangePin}','true'::jsonb)
        else e end
    )
    from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  ));

  update public.shift_board set value=v_cfg where key='config';
  return json_build_object('ok',true);
end;
$$;

revoke all on function public.manager_reset_staff_pin(text,text) from public, anon;
grant execute on function public.manager_reset_staff_pin(text,text) to authenticated;
