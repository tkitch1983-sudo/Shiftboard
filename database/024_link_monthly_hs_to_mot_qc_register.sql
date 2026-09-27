create or replace function public.stamp_monthly_hs_check()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_required text[] := array[
    'grinder','oxy_acetylene','tyre_machine','ramps','brake_rollers','jacks',
    'wheel_balancers','windy_tools','mig_welder','gas_analyser','manual_handling',
    'racking_stacking','step_ladders','housekeeping','ppe','coshh','mot_qc'
  ];
  v_key text;
  v_value text;
  v_content_changed boolean := false;
  v_qc public.mot_monthly_qc%rowtype;
begin
  if auth.uid() is null or v_role not in ('site','super') then
    raise exception 'Not authorised';
  end if;

  if new.site_id in ('mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf') then
    raise exception 'Monthly H&S checks are only used for workshop sites';
  end if;

  if v_role='site' and new.site_id<>v_site then
    raise exception 'Managers can only manage monthly H&S checks for their own site';
  end if;

  new.month_start := date_trunc('month', new.month_start)::date;
  new.updated_at := now();

  if tg_op='UPDATE' and old.status='published' and new.status='draft' then
    raise exception 'Published monthly H&S checks cannot be returned to draft';
  end if;

  if new.status='published' then
    foreach v_key in array v_required loop
      v_value := lower(coalesce(new.checks->v_key->>'status',''));
      if v_key='mot_qc' then
        if v_value not in ('ok','issue') then
          raise exception 'MOT QC must be marked OK or Issue before publishing';
        end if;
      elsif v_value not in ('ok','issue','na') then
        raise exception 'Every monthly H&S item must be marked OK, Issue or N/A before publishing';
      end if;
    end loop;

    if new.mot_qc_register_id is not null then
      select * into v_qc
      from public.mot_monthly_qc
      where id=new.mot_qc_register_id;

      if not found then
        raise exception 'The linked MOT QC register could not be found';
      end if;
      if v_qc.site_id<>new.site_id or v_qc.month_start<>new.month_start then
        raise exception 'The linked MOT QC register must be for the same site and month';
      end if;
      if not v_qc.completed then
        raise exception 'Complete the linked MOT QC register before publishing Monthly H&S';
      end if;
      if btrim(coalesce(v_qc.issues_found,''))<>'' and v_value<>'issue' then
        raise exception 'MOT QC must be marked Issue because the linked QC register contains issues';
      end if;
      if btrim(coalesce(v_qc.issues_found,''))='' and v_value<>'ok' then
        raise exception 'MOT QC must be marked OK when the linked QC register contains no issues';
      end if;
    elsif jsonb_typeof(coalesce(new.mot_qc_files,'[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.mot_qc_files,'[]'::jsonb)) < 1 then
      raise exception 'Complete the linked MOT QC register or upload the completed MOT QC copy before publishing';
    end if;

    if tg_op='INSERT' then
      new.revision := 1;
      v_content_changed := true;
    else
      v_content_changed := old.status <> 'published'
        or old.checks is distinct from new.checks
        or old.manager_notes is distinct from new.manager_notes
        or old.mot_qc_files is distinct from new.mot_qc_files
        or old.mot_qc_register_id is distinct from new.mot_qc_register_id;
      if old.status='published' and v_content_changed then
        new.revision := old.revision + 1;
      else
        new.revision := old.revision;
      end if;
    end if;

    if tg_op='INSERT' or v_content_changed then
      new.expected_staff := public.monthly_hs_active_staff(new.site_id);
      new.published_at := now();
      new.published_by := auth.uid();
      new.published_by_email := lower(coalesce(auth.jwt()->>'email',''));
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_monthly_hs_check() from public, anon, authenticated;

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
  v_mot_qc jsonb;
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

  if v_check.mot_qc_register_id is not null then
    select jsonb_build_object(
      'id',q.id,
      'site_id',q.site_id,
      'month_start',q.month_start,
      'checked_through',q.checked_through,
      'issues_found',q.issues_found,
      'actions_taken',q.actions_taken,
      'completed',q.completed,
      'completed_at',q.completed_at,
      'completed_by_email',q.completed_by_email,
      'updated_at',q.updated_at,
      'updated_by_email',q.updated_by_email
    ) into v_mot_qc
    from public.mot_monthly_qc q
    where q.id=v_check.mot_qc_register_id;
  end if;

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
    'mot_qc_files',v_check.mot_qc_files,
    'mot_qc_register_id',v_check.mot_qc_register_id,
    'mot_qc_register',v_mot_qc,
    'published_at',v_check.published_at,
    'acked',v_ack is not null,
    'acknowledged_at',v_ack
  );
end;
$$;

revoke all on function public.monthly_hs_for_pin(text,text) from public;
grant execute on function public.monthly_hs_for_pin(text,text) to anon, authenticated;
