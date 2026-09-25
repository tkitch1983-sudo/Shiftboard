alter table public.weekly_site_checks
  add column if not exists car_cleaning_files jsonb not null default '[]'::jsonb,
  add column if not exists site_cleaning_files jsonb not null default '[]'::jsonb,
  add column if not exists oxy_acetylene_files jsonb not null default '[]'::jsonb;

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
  if new.site_id in ('mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf') then
    raise exception 'Weekly checks are only used for workshop sites';
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

update public.portal_tab_permissions p
set allowed=false, updated_at=now(), granted_by='tony@neautoservices.com'
where p.tab_key='weeklychecks'
  and lower(p.email) in (
    select lower(u.email)
    from auth.users u
    where u.email is not null
      and u.raw_app_meta_data->>'role'='site'
      and coalesce(u.raw_app_meta_data->>'siteId','') in ('mtslj2e8qsrmk2','mtshgne7zriu4b','mtshovwtlsec4d','mtsojpx7bklqsf')
  );
