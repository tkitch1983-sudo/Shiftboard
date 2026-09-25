alter table public.portal_tab_permissions drop constraint if exists portal_tab_permissions_tab_key_check;

alter table public.portal_tab_permissions
  add constraint portal_tab_permissions_tab_key_check
  check (tab_key = any (array[
    'register'::text,'sickness'::text,'bradford'::text,'sales'::text,'targets'::text,
    'requests'::text,'calendar'::text,'timesheets'::text,'employees'::text,'contacts'::text,
    'clocklog'::text,'bonus'::text,'mot'::text,'stock'::text,'analysis'::text,'salesvs'::text,
    'passwords'::text,'managers'::text,'sites'::text,'bankholidays'::text,'audit'::text,
    'settings'::text,'pins'::text
  ]));

insert into public.portal_tab_permissions (email, tab_key, allowed, granted_by, updated_at)
select lower(email), 'pins', true, 'tony@neautoservices.com', now()
from auth.users
where raw_app_meta_data->>'role' in ('site','super')
  and email is not null
  and lower(email) <> 'tony@neautoservices.com'
on conflict (email, tab_key)
do update set
  allowed = excluded.allowed,
  granted_by = excluded.granted_by,
  updated_at = excluded.updated_at;
