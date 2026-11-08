-- Conditional transfer only: the existing reader remains the authorization boundary.
create or replace function public.manager_shiftboard_read_cached(p_hash text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_record jsonb;
  v_hash text;
begin
  v_record := public.manager_shiftboard_read();
  v_hash := md5(v_record::text);
  if p_hash = v_hash then
    return jsonb_build_object('hash', v_hash, 'unchanged', true);
  end if;
  return jsonb_build_object('hash', v_hash, 'record', v_record, 'unchanged', false);
end;
$$;
revoke all on function public.manager_shiftboard_read_cached(text) from public, anon;
grant execute on function public.manager_shiftboard_read_cached(text) to authenticated;
