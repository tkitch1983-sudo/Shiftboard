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

  if coalesce(new.car_cleaning_done,false) and jsonb_array_length(coalesce(new.car_cleaning_files,'[]'::jsonb))=0 then
    raise exception 'Car cleaning attachment is required';
  end if;
  if coalesce(new.site_cleaning_done,false) and jsonb_array_length(coalesce(new.site_cleaning_files,'[]'::jsonb))=0 then
    raise exception 'Site cleaning attachment is required';
  end if;
  if coalesce(new.stock_take_done,false) and jsonb_array_length(coalesce(new.stock_files,'[]'::jsonb))=0 then
    raise exception 'Stock take attachment is required';
  end if;
  if coalesce(new.oxy_acetylene_done,false) and jsonb_array_length(coalesce(new.oxy_acetylene_files,'[]'::jsonb))=0 then
    raise exception 'Oxy/acetylene attachment is required';
  end if;

  new.submitted_by := auth.uid();
  new.submitted_by_email := lower(coalesce(auth.jwt()->>'email',''));
  new.submitted_at := now();
  new.updated_at := now();
  return new;
end;
$$;
