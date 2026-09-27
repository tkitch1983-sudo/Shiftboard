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
  v_checked_through date;
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

    v_checked_through := least(
      current_date,
      (new.month_start + interval '1 month - 1 day')::date
    );
    if v_checked_through < new.month_start then
      v_checked_through := new.month_start;
    end if;

    insert into public.mot_monthly_qc(
      site_id, month_start, checked_through, completed
    ) values (
      new.site_id, new.month_start, v_checked_through, true
    )
    on conflict(site_id, month_start) do update
      set checked_through = greatest(
            coalesce(public.mot_monthly_qc.checked_through, excluded.checked_through),
            excluded.checked_through
          ),
          completed = true
    returning id into new.mot_qc_register_id;

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
