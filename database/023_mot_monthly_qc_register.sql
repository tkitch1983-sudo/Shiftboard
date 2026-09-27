create table if not exists public.mot_monthly_qc (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  month_start date not null,
  checked_through date,
  issues_found text not null default '',
  actions_taken text not null default '',
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  completed_by_email text,
  progress_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  unique(site_id, month_start),
  check (month_start = date_trunc('month', month_start)::date),
  check (checked_through is null or (checked_through >= month_start and checked_through < (month_start + interval '1 month')::date)),
  check (jsonb_typeof(progress_log) = 'array')
);

alter table public.mot_monthly_qc enable row level security;
revoke all on table public.mot_monthly_qc from public, anon;
grant select, insert, update on table public.mot_monthly_qc to authenticated;

create index if not exists mot_monthly_qc_month_site_idx
  on public.mot_monthly_qc(month_start, site_id);

drop policy if exists mot_monthly_qc_select on public.mot_monthly_qc;
create policy mot_monthly_qc_select on public.mot_monthly_qc
for select to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role','')='super'
  or (
    coalesce((select auth.jwt())->'app_metadata'->>'role','')='site'
    and site_id=coalesce((select auth.jwt())->'app_metadata'->>'siteId','')
  )
  or (select public.has_portal_tab_permission('mot'))
);

drop policy if exists mot_monthly_qc_insert on public.mot_monthly_qc;
create policy mot_monthly_qc_insert on public.mot_monthly_qc
for insert to authenticated
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role','')='super'
  or (
    coalesce((select auth.jwt())->'app_metadata'->>'role','')='site'
    and site_id=coalesce((select auth.jwt())->'app_metadata'->>'siteId','')
  )
  or (select public.has_portal_tab_permission('mot'))
);

drop policy if exists mot_monthly_qc_update on public.mot_monthly_qc;
create policy mot_monthly_qc_update on public.mot_monthly_qc
for update to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role','')='super'
  or (
    coalesce((select auth.jwt())->'app_metadata'->>'role','')='site'
    and site_id=coalesce((select auth.jwt())->'app_metadata'->>'siteId','')
  )
  or (select public.has_portal_tab_permission('mot'))
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role','')='super'
  or (
    coalesce((select auth.jwt())->'app_metadata'->>'role','')='site'
    and site_id=coalesce((select auth.jwt())->'app_metadata'->>'siteId','')
  )
  or (select public.has_portal_tab_permission('mot'))
);

create or replace function public.stamp_mot_monthly_qc()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_role text := coalesce((select auth.jwt())->'app_metadata'->>'role','');
  v_site text := coalesce((select auth.jwt())->'app_metadata'->>'siteId','');
  v_email text := lower(coalesce((select auth.jwt())->>'email',''));
  v_changed boolean := true;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if v_role='site' and new.site_id<>v_site then
    raise exception 'Managers can only manage MOT QC for their own site';
  end if;

  if v_role not in ('site','super') and not public.has_portal_tab_permission('mot') then
    raise exception 'Not authorised';
  end if;

  new.month_start := date_trunc('month',new.month_start)::date;
  if new.checked_through is not null
     and (new.checked_through < new.month_start
          or new.checked_through >= (new.month_start + interval '1 month')::date) then
    raise exception 'Checked-through date must be within the selected month';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := v_email;

  if tg_op='UPDATE' then
    v_changed := old.checked_through is distinct from new.checked_through
      or old.issues_found is distinct from new.issues_found
      or old.actions_taken is distinct from new.actions_taken
      or old.completed is distinct from new.completed;
  end if;

  if new.completed and (tg_op='INSERT' or not old.completed) then
    new.completed_at := now();
    new.completed_by := auth.uid();
    new.completed_by_email := v_email;
  elsif not new.completed then
    new.completed_at := null;
    new.completed_by := null;
    new.completed_by_email := null;
  end if;

  if tg_op='INSERT' then
    new.progress_log := jsonb_build_array(jsonb_build_object(
      'saved_at',now(),
      'saved_by',v_email,
      'checked_through',new.checked_through,
      'issues_found',new.issues_found,
      'actions_taken',new.actions_taken,
      'completed',new.completed
    ));
  elsif v_changed then
    new.progress_log := coalesce(old.progress_log,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'saved_at',now(),
      'saved_by',v_email,
      'checked_through',new.checked_through,
      'issues_found',new.issues_found,
      'actions_taken',new.actions_taken,
      'completed',new.completed
    ));
  else
    new.progress_log := old.progress_log;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_mot_monthly_qc() from public, anon;
grant execute on function public.stamp_mot_monthly_qc() to authenticated;

drop trigger if exists mot_monthly_qc_stamp on public.mot_monthly_qc;
create trigger mot_monthly_qc_stamp
before insert or update on public.mot_monthly_qc
for each row execute function public.stamp_mot_monthly_qc();

alter table public.monthly_hs_checks
  add column if not exists mot_qc_register_id uuid references public.mot_monthly_qc(id) on delete set null;

create index if not exists monthly_hs_mot_qc_register_idx
  on public.monthly_hs_checks(mot_qc_register_id);

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
  v_linked_complete boolean := false;
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

  if new.mot_qc_register_id is not null then
    select q.completed into v_linked_complete
    from public.mot_monthly_qc q
    where q.id=new.mot_qc_register_id
      and q.site_id=new.site_id
      and q.month_start=new.month_start;
    if not found then
      raise exception 'Linked MOT QC record does not match this site and month';
    end if;
  end if;

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

    if not v_linked_complete and (
      jsonb_typeof(coalesce(new.mot_qc_files,'[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(new.mot_qc_files,'[]'::jsonb)) < 1
    ) then
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
      'checked_through',q.checked_through,
      'issues_found',q.issues_found,
      'actions_taken',q.actions_taken,
      'completed',q.completed,
      'completed_at',q.completed_at
    ) into v_mot_qc
    from public.mot_monthly_qc q
    where q.id=v_check.mot_qc_register_id
      and q.site_id=v_check.site_id
      and q.month_start=v_check.month_start;
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
