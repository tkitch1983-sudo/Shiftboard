create table if not exists public.weekly_site_checks (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  week_start date not null,
  weekly_timesheet_done boolean not null default false,
  car_cleaning_done boolean not null default false,
  site_cleaning_done boolean not null default false,
  stock_take_done boolean not null default false,
  flag_status text not null default 'ok' check (flag_status in ('ok','issue')),
  oxy_acetylene_done boolean not null default false,
  mot_log_status text not null default 'up_to_date' check (mot_log_status in ('up_to_date','issue')),
  maintenance_status text not null default 'OK',
  vehicles_left_status text not null default 'No vehicles left on site',
  alarm_callout_status text not null default 'Not required',
  notes text,
  stock_files jsonb not null default '[]'::jsonb,
  submitted_by uuid,
  submitted_by_email text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, week_start)
);

alter table public.weekly_site_checks enable row level security;

drop policy if exists weekly_site_checks_select on public.weekly_site_checks;
create policy weekly_site_checks_select on public.weekly_site_checks
for select to authenticated
using (
  coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
  or (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
    and site_id=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
  )
);

drop policy if exists weekly_site_checks_insert on public.weekly_site_checks;
create policy weekly_site_checks_insert on public.weekly_site_checks
for insert to authenticated
with check (
  coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
  or (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
    and site_id=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
  )
);

drop policy if exists weekly_site_checks_update on public.weekly_site_checks;
create policy weekly_site_checks_update on public.weekly_site_checks
for update to authenticated
using (
  coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
  or (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
    and site_id=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
  )
)
with check (
  coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
  or (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
    and site_id=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
  )
);

drop policy if exists weekly_site_checks_delete on public.weekly_site_checks;
create policy weekly_site_checks_delete on public.weekly_site_checks
for delete to authenticated
using (coalesce(auth.jwt()->'app_metadata'->>'role','')='super');

grant select,insert,update,delete on public.weekly_site_checks to authenticated;

create or replace function public.stamp_weekly_site_check()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
begin
  if auth.uid() is null or v_role not in ('site','super') then
    raise exception 'Not authorised';
  end if;
  if v_role='site' and new.site_id<>v_site then
    raise exception 'Managers can only submit weekly checks for their own site';
  end if;
  new.submitted_by := auth.uid();
  new.submitted_by_email := lower(coalesce(auth.jwt()->>'email',''));
  new.submitted_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists weekly_site_checks_stamp on public.weekly_site_checks;
create trigger weekly_site_checks_stamp
before insert or update on public.weekly_site_checks
for each row execute function public.stamp_weekly_site_check();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'weekly-checks','weekly-checks',false,20971520,
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists weekly_check_files_select on storage.objects;
create policy weekly_check_files_select on storage.objects
for select to authenticated
using (
  bucket_id='weekly-checks' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

drop policy if exists weekly_check_files_insert on storage.objects;
create policy weekly_check_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='weekly-checks' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

drop policy if exists weekly_check_files_delete on storage.objects;
create policy weekly_check_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id='weekly-checks' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','')='super'
    or (
      coalesce(auth.jwt()->'app_metadata'->>'role','')='site'
      and (storage.foldername(name))[1]=coalesce(auth.jwt()->'app_metadata'->>'siteId','')
    )
  )
);

alter table public.portal_tab_permissions drop constraint if exists portal_tab_permissions_tab_key_check;
alter table public.portal_tab_permissions
  add constraint portal_tab_permissions_tab_key_check
  check (tab_key = any (array[
    'register'::text,'sickness'::text,'bradford'::text,'sales'::text,'targets'::text,
    'requests'::text,'calendar'::text,'timesheets'::text,'employees'::text,'contacts'::text,
    'clocklog'::text,'bonus'::text,'mot'::text,'stock'::text,'analysis'::text,'salesvs'::text,
    'passwords'::text,'managers'::text,'sites'::text,'bankholidays'::text,'audit'::text,
    'settings'::text,'pins'::text,'weeklychecks'::text
  ]));

insert into public.portal_tab_permissions(email,tab_key,allowed,granted_by,updated_at)
select lower(email),'weeklychecks',true,'tony@neautoservices.com',now()
from auth.users
where raw_app_meta_data->>'role' in ('site','super')
  and email is not null
  and lower(email)<>'tony@neautoservices.com'
on conflict(email,tab_key)
do update set allowed=true,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
