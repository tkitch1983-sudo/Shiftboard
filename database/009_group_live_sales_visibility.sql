-- Live Sales is a group comparison page. All authenticated manager roles can
-- view every site's sales snapshot; non-manager authenticated accounts remain
-- excluded because they do not carry a supported app_metadata role.
drop policy if exists "managers view scoped sales snapshots" on public.sales_daily_snapshots;
drop policy if exists "all managers view group sales snapshots" on public.sales_daily_snapshots;

create policy "all managers view group sales snapshots"
on public.sales_daily_snapshots
for select
to authenticated
using (
  ((select auth.jwt())->'app_metadata'->>'role') in ('super','site')
);
