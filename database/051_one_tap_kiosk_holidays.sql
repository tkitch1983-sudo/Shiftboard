-- One-tap read-only staff kiosk calendar for the device's selected site.
-- This endpoint deliberately shares only approved leave display names, dates,
-- leave amounts and units. No PINs, medical data, employee records or balances.
-- Note: without device pairing, a public caller can request another valid site
-- ID. The parameter filters results, but it is not an authentication boundary.
create or replace function public.kiosk_holidays_month(p_site_id text, p_month text)
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
  if not exists (
    select 1 from public.shift_board c
    cross join lateral jsonb_array_elements(coalesce(c.value->'sites','[]'::jsonb)) s
    where c.key='config' and s->>'id'=p_site_id
  ) then
    return jsonb_build_object('ok',false,'error','Unknown kiosk location');
  end if;
  v_start := to_date(p_month||'-01','YYYY-MM-DD');
  with staff as (
    select e->>'id' employee_id, e->>'name' display_name,
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
revoke all on function public.kiosk_holidays_month(text,text) from public, anon, authenticated;
grant execute on function public.kiosk_holidays_month(text,text) to anon, authenticated;

-- The retired manager-pairing RPCs are no longer part of kiosk operation.
revoke all on function public.kiosk_holidays_month(text,text,text) from public, anon, authenticated;
revoke all on function public.kiosk_holidays_enrol(text,text) from public, anon, authenticated;
revoke all on function public.kiosk_holidays_revoke(text) from public, anon, authenticated;
