create table if not exists public.mot_reconciliation_actions (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  row_key text not null,
  reason text not null default '',
  actioned boolean not null default false,
  actioned_at timestamptz,
  actioned_by uuid,
  actioned_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  unique(month_start,row_key),
  check (month_start = date_trunc('month',month_start)::date),
  check (length(trim(row_key)) > 0)
);

alter table public.mot_reconciliation_actions enable row level security;
revoke all on table public.mot_reconciliation_actions from public, anon;
grant select, insert, update on table public.mot_reconciliation_actions to authenticated;

drop policy if exists mot_reconciliation_actions_select on public.mot_reconciliation_actions;
create policy mot_reconciliation_actions_select on public.mot_reconciliation_actions
for select to authenticated
using ((select public.has_portal_tab_permission('mot')));

drop policy if exists mot_reconciliation_actions_insert on public.mot_reconciliation_actions;
create policy mot_reconciliation_actions_insert on public.mot_reconciliation_actions
for insert to authenticated
with check ((select public.has_portal_tab_permission('mot')));

drop policy if exists mot_reconciliation_actions_update on public.mot_reconciliation_actions;
create policy mot_reconciliation_actions_update on public.mot_reconciliation_actions
for update to authenticated
using ((select public.has_portal_tab_permission('mot')))
with check ((select public.has_portal_tab_permission('mot')));

create or replace function public.stamp_mot_reconciliation_action()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_email text := lower(coalesce((select auth.jwt())->>'email',''));
begin
  if auth.uid() is null or not public.has_portal_tab_permission('mot') then
    raise exception 'Not authorised';
  end if;

  new.month_start := date_trunc('month',new.month_start)::date;
  new.row_key := trim(new.row_key);
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := v_email;

  if new.actioned and (tg_op='INSERT' or not old.actioned) then
    new.actioned_at := now();
    new.actioned_by := auth.uid();
    new.actioned_by_email := v_email;
  elsif not new.actioned then
    new.actioned_at := null;
    new.actioned_by := null;
    new.actioned_by_email := null;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_mot_reconciliation_action() from public, anon;
grant execute on function public.stamp_mot_reconciliation_action() to authenticated;

drop trigger if exists mot_reconciliation_actions_stamp on public.mot_reconciliation_actions;
create trigger mot_reconciliation_actions_stamp
before insert or update on public.mot_reconciliation_actions
for each row execute function public.stamp_mot_reconciliation_action();
