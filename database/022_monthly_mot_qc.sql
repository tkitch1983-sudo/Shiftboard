alter table public.monthly_hs_checks
  add column if not exists mot_qc_files jsonb not null default '[]'::jsonb;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'monthly-hs','monthly-hs',false,20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists monthly_hs_files_select on storage.objects;
create policy monthly_hs_files_select on storage.objects
for select to authenticated
using (
  bucket_id='monthly-hs' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

drop policy if exists monthly_hs_files_insert on storage.objects;
create policy monthly_hs_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='monthly-hs' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

drop policy if exists monthly_hs_files_delete on storage.objects;
create policy monthly_hs_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id='monthly-hs' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

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

    if jsonb_typeof(coalesce(new.mot_qc_files,'[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.mot_qc_files,'[]'::jsonb)) < 1 then
      raise exception 'Upload the completed MOT QC copy before publishing';
    end if;

    if tg_op='INSERT' then
      new.revision := 1;
      v_content_changed := true;
    else
      v_content_changed := old.status <> 'published'
        or old.checks is distinct from new.checks
        or old.manager_notes is distinct from new.manager_notes
        or old.mot_qc_files is distinct from new.mot_qc_files;
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
    'mot_qc_files',v_check.mot_qc_files,
    'published_at',v_check.published_at,
    'acked',v_ack is not null,
    'acknowledged_at',v_ack
  );
end;
$$;

revoke all on function public.monthly_hs_for_pin(text,text) from public;
grant execute on function public.monthly_hs_for_pin(text,text) to anon, authenticated;
