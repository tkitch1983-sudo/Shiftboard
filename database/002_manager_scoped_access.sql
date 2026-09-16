-- Database-enforced manager scope. Site managers never receive the shared raw rows.
alter table public.shift_board
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.manager_shiftboard_read()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_cfg jsonb; v_events jsonb; v_requests jsonb; v_absences jsonb;
  v_times jsonb; v_targets jsonb; v_safe_cfg jsonb; v_safe_employees jsonb;
  v_safe_events jsonb; v_safe_requests jsonb; v_safe_absences jsonb;
  v_safe_times jsonb := '{}'::jsonb; v_safe_targets jsonb := '{}'::jsonb;
  v_week record; v_month record; v_emp_ids text[];
  v_week_employees jsonb; v_week_notes jsonb; v_month_value jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or v_role not in ('super','site') then
    raise exception 'Not authorised';
  end if;

  if v_role='super' then
    select coalesce(jsonb_object_agg(key,
      case when key='bonusSheets' and v_email not in ('tony@neautoservices.com','jack@neautoservices.com')
        then '{}'::jsonb else value end
    ),'{}'::jsonb) into v_result from public.shift_board;
    return v_result;
  end if;

  if v_site='' then raise exception 'Manager has no assigned site'; end if;
  select value into v_cfg from public.shift_board where key='config';
  select coalesce(value,'[]'::jsonb) into v_events from public.shift_board where key='clockEvents';
  select coalesce(value,'[]'::jsonb) into v_requests from public.shift_board where key='holidayRequests';
  select coalesce(value,'[]'::jsonb) into v_absences from public.shift_board where key='absences';
  select coalesce(value,'{}'::jsonb) into v_times from public.shift_board where key='timesheetExtras';
  select coalesce(value,'{}'::jsonb) into v_targets from public.shift_board where key='targetSheets';

  select coalesce(array_agg(e->>'id'),'{}'::text[]) into v_emp_ids
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'siteId'=v_site;

  select coalesce(jsonb_agg(
    case when e->>'siteId'=v_site then e-'pin'
      else jsonb_build_object('id',e->>'id','name',e->>'name','siteId',e->>'siteId','active',coalesce(e->'active','true'::jsonb)) end
  ),'[]'::jsonb) into v_safe_employees
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e
  where e->>'siteId'=v_site or exists (
    select 1 from jsonb_array_elements(v_events) ev
    where ev->>'siteId'=v_site and ev->>'employeeId'=e->>'id'
  );

  v_safe_cfg := jsonb_build_object(
    'sites',coalesce(v_cfg->'sites','[]'::jsonb),
    'employees',v_safe_employees,
    'siteManagers','[]'::jsonb,
    'admins','[]'::jsonb,
    'bankHolidays',coalesce(v_cfg->'bankHolidays','[]'::jsonb),
    'settings',coalesce(v_cfg->'settings','{}'::jsonb)-'passwordVault'
  );
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_safe_events
  from jsonb_array_elements(v_events) e
  where e->>'employeeId'=any(v_emp_ids) or e->>'siteId'=v_site;
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_safe_requests
  from jsonb_array_elements(v_requests) e where e->>'employeeId'=any(v_emp_ids);
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_safe_absences
  from jsonb_array_elements(v_absences) e where e->>'employeeId'=any(v_emp_ids);

  for v_week in select key,value from jsonb_each(v_times) loop
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_week_employees
    from jsonb_each(coalesce(v_week.value->'employees','{}'::jsonb)) where key=any(v_emp_ids);
    select case when coalesce(v_week.value->'notes','{}'::jsonb) ? v_site
      then jsonb_build_object(v_site,v_week.value->'notes'->v_site) else '{}'::jsonb end into v_week_notes;
    v_safe_times := jsonb_set(v_safe_times,array[v_week.key],jsonb_build_object(
      'employees',v_week_employees,'notes',v_week_notes,'lock',v_week.value->'lock'
    ),true);
  end loop;

  for v_month in select key,value from jsonb_each(v_targets) loop
    if coalesce(v_month.value->'sites','{}'::jsonb) ? v_site then
      v_month_value := (v_month.value-'sites') || jsonb_build_object('sites',jsonb_build_object(v_site,v_month.value->'sites'->v_site));
      v_safe_targets := jsonb_set(v_safe_targets,array[v_month.key],v_month_value,true);
    end if;
  end loop;

  return jsonb_build_object(
    'config',v_safe_cfg,'clockEvents',v_safe_events,'holidayRequests',v_safe_requests,
    'absences',v_safe_absences,'timesheetExtras',v_safe_times,'targetSheets',v_safe_targets,
    'bonusSheets','{}'::jsonb
  );
end;
$$;

create or replace function public.manager_shiftboard_write(p_key text, p_value jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_cfg jsonb; v_current jsonb; v_merged jsonb; v_allowed jsonb; v_preserved jsonb;
  v_emp_ids text[]; v_item record; v_current_week jsonb; v_new_week jsonb;
  v_other_employees jsonb; v_new_employees jsonb; v_notes jsonb;
  v_month record; v_current_site jsonb; v_submitted_site jsonb; v_days jsonb;
begin
  if auth.uid() is null or v_role not in ('super','site') then raise exception 'Not authorised'; end if;
  if p_key not in ('config','holidayRequests','clockEvents','timesheetExtras','absences','targetSheets','bonusSheets') then
    raise exception 'Unknown data key';
  end if;

  if v_role='super' then
    if p_key='bonusSheets' and v_email not in ('tony@neautoservices.com','jack@neautoservices.com') then
      raise exception 'Bonus Sheet is private';
    end if;
    insert into public.shift_board(key,value,updated_at) values(p_key,p_value,now())
    on conflict(key) do update set value=excluded.value,updated_at=now();
    return true;
  end if;

  if v_site='' then raise exception 'Manager has no assigned site'; end if;
  if p_key in ('config','bonusSheets') then raise exception 'Upper Management only'; end if;
  select value into v_cfg from public.shift_board where key='config';
  select coalesce(array_agg(e->>'id'),'{}'::text[]) into v_emp_ids
  from jsonb_array_elements(coalesce(v_cfg->'employees','[]'::jsonb)) e where e->>'siteId'=v_site;

  insert into public.shift_board(key,value) values(p_key,case when p_key in ('timesheetExtras','targetSheets') then '{}'::jsonb else '[]'::jsonb end)
  on conflict(key) do nothing;
  select value into v_current from public.shift_board where key=p_key for update;

  if p_key in ('holidayRequests','clockEvents','absences') then
    select coalesce(jsonb_agg(e),'[]'::jsonb) into v_preserved
    from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) e
    where not (e->>'employeeId'=any(v_emp_ids));
    select coalesce(jsonb_agg(e),'[]'::jsonb) into v_allowed
    from jsonb_array_elements(coalesce(p_value,'[]'::jsonb)) e
    where e->>'employeeId'=any(v_emp_ids);
    v_merged := v_preserved || v_allowed;

  elsif p_key='timesheetExtras' then
    v_merged := coalesce(v_current,'{}'::jsonb);
    for v_item in select key,value from jsonb_each(coalesce(p_value,'{}'::jsonb)) loop
      v_current_week := coalesce(v_merged->v_item.key,'{}'::jsonb);
      v_new_week := coalesce(v_item.value,'{}'::jsonb);
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_other_employees
      from jsonb_each(coalesce(v_current_week->'employees','{}'::jsonb)) where not (key=any(v_emp_ids));
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_new_employees
      from jsonb_each(coalesce(v_new_week->'employees','{}'::jsonb)) where key=any(v_emp_ids);
      v_notes := coalesce(v_current_week->'notes','{}'::jsonb);
      if coalesce(v_new_week->'notes','{}'::jsonb) ? v_site then
        v_notes := jsonb_set(v_notes,array[v_site],v_new_week->'notes'->v_site,true);
      end if;
      v_current_week := v_current_week || jsonb_build_object('employees',v_other_employees||v_new_employees,'notes',v_notes);
      v_merged := jsonb_set(v_merged,array[v_item.key],v_current_week,true);
    end loop;

  elsif p_key='targetSheets' then
    v_merged := coalesce(v_current,'{}'::jsonb);
    for v_month in select key,value from jsonb_each(coalesce(p_value,'{}'::jsonb)) loop
      v_current_site := v_merged #> array[v_month.key,'sites',v_site];
      v_submitted_site := v_month.value #> array['sites',v_site];
      if v_current_site is null or v_submitted_site is null then continue; end if;
      select coalesce(jsonb_agg(
        case when nd.day is null then cd.day
          else jsonb_set(cd.day,'{actual}',coalesce(nd.day->'actual','null'::jsonb),true) end
        order by cd.ord
      ),'[]'::jsonb) into v_days
      from jsonb_array_elements(coalesce(v_current_site->'days','[]'::jsonb)) with ordinality cd(day,ord)
      left join lateral (
        select n as day from jsonb_array_elements(coalesce(v_submitted_site->'days','[]'::jsonb)) n
        where n->>'date'=cd.day->>'date' limit 1
      ) nd on true;
      v_current_site := jsonb_set(v_current_site,'{days}',v_days,true);
      v_merged := jsonb_set(v_merged,array[v_month.key,'sites',v_site],v_current_site,true);
      v_merged := jsonb_set(v_merged,array[v_month.key,'updatedAt'],to_jsonb((extract(epoch from now())*1000)::bigint),true);
      v_merged := jsonb_set(v_merged,array[v_month.key,'updatedBy'],to_jsonb(v_email),true);
    end loop;
  end if;

  update public.shift_board set value=v_merged,updated_at=now() where key=p_key;
  return true;
end;
$$;

revoke all on function public.manager_shiftboard_read() from public, anon;
revoke all on function public.manager_shiftboard_write(text,jsonb) from public, anon;
grant execute on function public.manager_shiftboard_read() to authenticated;
grant execute on function public.manager_shiftboard_write(text,jsonb) to authenticated;

drop policy if exists "manager access" on public.shift_board;
create policy "upper management shared data" on public.shift_board
for all to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role')='super'
  and (key<>'bonusSheets' or lower(coalesce((select auth.jwt()->>'email'),'')) in ('tony@neautoservices.com','jack@neautoservices.com'))
)
with check (
  (select auth.jwt()->'app_metadata'->>'role')='super'
  and (key<>'bonusSheets' or lower(coalesce((select auth.jwt()->>'email'),'')) in ('tony@neautoservices.com','jack@neautoservices.com'))
);

drop policy if exists "managers view photos" on public.clock_photos;
create policy "managers view scoped photos" on public.clock_photos
for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role')='super'
  or ((select auth.jwt()->'app_metadata'->>'role')='site'
      and site_id=(select auth.jwt()->'app_metadata'->>'siteId'))
);

drop policy if exists "workshop managers view sales snapshots" on public.sales_daily_snapshots;
create policy "managers view scoped sales snapshots" on public.sales_daily_snapshots
for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role')='super'
  or (
    (select auth.jwt()->'app_metadata'->>'role')='site'
    and site_key = case (select auth.jwt()->'app_metadata'->>'siteId')
      when 's7' then 'chester-le-street' when 's6' then 'fairfield'
      when 's5' then 'gateshead' when 's4' then 'hartlepool'
      when 's8' then 'lido' when 's3' then 'middlesbrough'
      when 's2' then 'peterlee' when 's1' then 'seaham' else '__none__' end
  )
);
