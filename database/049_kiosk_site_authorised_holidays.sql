-- Staff kiosk approved-holiday calendar. Enrolment requires an authenticated
-- site manager for that site or an upper-management session.
-- Public kiosks only receive names and approved dates after presenting a
-- device-specific 256-bit bearer token; the database stores its SHA-256 hash.
create table if not exists public.kiosk_holiday_site_grants (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  site_id text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.kiosk_holiday_site_grants enable row level security;
revoke all on public.kiosk_holiday_site_grants from public, anon, authenticated;
create index if not exists kiosk_holiday_site_grants_site_idx
  on public.kiosk_holiday_site_grants(site_id) where revoked_at is null;

create or replace function public.kiosk_holidays_enrol(p_site_id text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_manager_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_hash text;
begin
  if auth.uid() is null or v_role not in ('super','site')
     or (v_role = 'site' and v_manager_site <> p_site_id) then
    raise exception 'A manager authorised for this site must sign in first';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid kiosk enrolment token';
  end if;
  if not exists (
    select 1 from public.shift_board c
    cross join lateral jsonb_array_elements(coalesce(c.value->'sites','[]'::jsonb)) s
    where c.key='config' and s->>'id'=p_site_id
  ) then
    raise exception 'Unknown site';
  end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  insert into public.kiosk_holiday_site_grants(token_hash,site_id,created_by)
  values(v_hash,p_site_id,auth.uid());
  return jsonb_build_object('ok',true,'siteId',p_site_id);
end
$$;

create or replace function public.kiosk_holidays_revoke(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_manager_site text := coalesce(auth.jwt()->'app_metadata'->>'siteId','');
  v_site text;
begin
  if auth.uid() is null or v_role not in ('super','site') then
    raise exception 'Manager sign-in required';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid kiosk token';
  end if;
  select site_id into v_site from public.kiosk_holiday_site_grants
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and revoked_at is null;
  if v_site is null then return jsonb_build_object('ok',true); end if;
  if v_role='site' and v_manager_site<>v_site then
    raise exception 'This kiosk belongs to another site';
  end if;
  update public.kiosk_holiday_site_grants set revoked_at=now()
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.kiosk_holidays_month(p_site_id text, p_token text, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_start date;
  v_entries jsonb;
begin
  if p_month is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok',false,'error','Invalid calendar month');
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from public.kiosk_holiday_site_grants g
       where g.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
         and g.site_id=p_site_id and g.revoked_at is null
     ) then
    return jsonb_build_object('ok',false,'error','Kiosk calendar not authorised for this location');
  end if;
  v_start := to_date(p_month||'-01','YYYY-MM-DD');
  with staff as (
    select e->>'id' employee_id,
           e->>'name' display_name,
           case when e->>'holidayUnit'='hours' then 'hours' else 'days' end as unit
    from public.shift_board c
    cross join lateral jsonb_array_elements(coalesce(c.value->'employees','[]'::jsonb)) e
    where c.key='config' and e->>'siteId'=p_site_id
      and coalesce((e->>'active')::boolean,true)
  ),
  approved as (
    select staff.employee_id, staff.display_name, staff.unit,
           case when jsonb_typeof(d.entry)='string' then d.entry #>> '{}'
                else d.entry->>'date' end as date_iso,
           case when jsonb_typeof(d.entry)='object'
                     and coalesce(d.entry->>'amount','') ~ '^[0-9]+([.][0-9]+)?$'
                then (d.entry->>'amount')::numeric else 1 end as amount
    from public.shift_board h
    cross join lateral jsonb_array_elements(coalesce(h.value,'[]'::jsonb)) r
    join staff on staff.employee_id=r->>'employeeId'
    cross join lateral jsonb_array_elements(coalesce(r->'dates','[]'::jsonb)) d(entry)
    where h.key='holidayRequests' and r->>'status'='approved'
  ),
  totals as (
    select employee_id, display_name, unit, date_iso,
           case when unit='days' then least(1,sum(amount))
                else sum(amount) end as amount
    from approved
    where date_iso >= v_start::text
      and date_iso < (v_start + interval '1 month')::date::text
      and date_iso ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-3][0-9]$'
      and amount>0
    group by employee_id,display_name,unit,date_iso
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',date_iso,'name',display_name,'amount',amount,'unit',unit
  ) order by date_iso,display_name),'[]'::jsonb)
  into v_entries from totals;

  return jsonb_build_object(
    'ok',true,'siteId',p_site_id,'month',p_month,
    'entries',v_entries,'updatedAt',now()
  );
end
$$;

revoke all on function public.kiosk_holidays_enrol(text,text) from public, anon, authenticated;
revoke all on function public.kiosk_holidays_revoke(text) from public, anon, authenticated;
revoke all on function public.kiosk_holidays_month(text,text,text) from public, anon, authenticated;
grant execute on function public.kiosk_holidays_enrol(text,text) to authenticated;
grant execute on function public.kiosk_holidays_revoke(text) to authenticated;
grant execute on function public.kiosk_holidays_month(text,text,text) to anon, authenticated;
