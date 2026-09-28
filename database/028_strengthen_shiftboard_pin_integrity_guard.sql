create or replace function public.guard_shiftboard_config_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_employees integer;
  new_employees integer;
  old_pins integer;
  new_pins integer;
  v_bad_name text;
  v_duplicate_pin text;
begin
  if new.key <> 'config' or old.key <> 'config' then
    return new;
  end if;

  old_employees := jsonb_array_length(coalesce(old.value->'employees','[]'::jsonb));
  new_employees := jsonb_array_length(coalesce(new.value->'employees','[]'::jsonb));

  select count(*) into old_pins
  from jsonb_array_elements(coalesce(old.value->'employees','[]'::jsonb)) e
  where coalesce(e->>'pin','') ~ '^[0-9]{4}$';

  select count(*) into new_pins
  from jsonb_array_elements(coalesce(new.value->'employees','[]'::jsonb)) e
  where coalesce(e->>'pin','') ~ '^[0-9]{4}$';

  if old_employees >= 20 and new_employees < greatest(10, floor(old_employees * 0.75)::integer) then
    raise exception 'Config update rejected: employee list appears incomplete (% -> %)', old_employees, new_employees;
  end if;

  if old_pins >= 20 and new_pins < greatest(10, floor(old_pins * 0.75)::integer) then
    raise exception 'Config update rejected: staff credential data appears incomplete (% -> %)', old_pins, new_pins;
  end if;

  -- Preserve PIN integrity for employees who remain in the config. Valid
  -- 4-digit PIN changes are still allowed for the manager reset workflow.
  select coalesce(n->>'name', o->>'name', o->>'id')
    into v_bad_name
  from jsonb_array_elements(coalesce(old.value->'employees','[]'::jsonb)) o
  join jsonb_array_elements(coalesce(new.value->'employees','[]'::jsonb)) n
    on n->>'id' = o->>'id'
  where coalesce(o->>'pin','') ~ '^[0-9]{4}$'
    and coalesce(n->>'pin','') !~ '^[0-9]{4}$'
  limit 1;

  if v_bad_name is not null then
    raise exception 'Config update rejected: PIN would be removed or invalid for %', v_bad_name;
  end if;

  select coalesce(e->>'name', e->>'id')
    into v_bad_name
  from jsonb_array_elements(coalesce(new.value->'employees','[]'::jsonb)) e
  where coalesce((e->>'active')::boolean, true)
    and coalesce(e->>'pin','') !~ '^[0-9]{4}$'
  limit 1;

  if v_bad_name is not null then
    raise exception 'Config update rejected: active employee has no valid 4-digit PIN: %', v_bad_name;
  end if;

  select pin into v_duplicate_pin
  from (
    select e->>'pin' as pin
    from jsonb_array_elements(coalesce(new.value->'employees','[]'::jsonb)) e
    where coalesce((e->>'active')::boolean, true)
      and coalesce(e->>'pin','') ~ '^[0-9]{4}$'
    group by e->>'pin'
    having count(*) > 1
  ) d
  limit 1;

  if v_duplicate_pin is not null then
    raise exception 'Config update rejected: duplicate active staff PIN detected';
  end if;

  return new;
end;
$$;
