-- Target-sheet actuals are operational entries, not system failures.
-- Do not flag historic blanks, especially for months introduced part-way through.
create or replace function public.manager_operational_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_alerts jsonb := '[]'::jsonb;
  v_run public.sales_import_runs%rowtype;
  v_stock_date date;
  v_stock_bad integer;
begin
  if auth.uid() is null or v_role<>'super' then
    raise exception 'Upper Management only';
  end if;

  select * into v_run from public.sales_import_runs order by run_date desc limit 1;
  if v_run.run_date is null or v_run.run_date < current_date-2 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','error','message','Nightly sales figures have not updated for more than two days.'
    ));
  elsif v_run.status<>'success' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','error','message','Latest sales import is '||v_run.status||coalesce(': '||v_run.message,'')
    ));
  end if;

  select max(snapshot_date) into v_stock_date from public.stock_value_snapshots;
  if v_stock_date is null or v_stock_date < current_date-2 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','warn','message','Stock values have not updated for more than two days.'
    ));
  else
    select count(*) into v_stock_bad
    from public.stock_value_snapshots
    where snapshot_date=v_stock_date and import_status<>'ok';
    if v_stock_bad>0 then
      v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
        'level','warn',
        'message',v_stock_bad||' stock-value site update'||case when v_stock_bad=1 then '' else 's' end||' need attention.'
      ));
    end if;
  end if;

  return v_alerts;
end;
$$;

revoke all on function public.manager_operational_alerts() from public, anon;
grant execute on function public.manager_operational_alerts() to authenticated;
