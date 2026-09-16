-- Keep the internal throttle table completely closed to the Data API.
drop policy if exists "no direct pin attempt access" on public.pin_attempts;
create policy "no direct pin attempt access" on public.pin_attempts
as restrictive for all to public using (false) with check (false);
drop index if exists public.pin_attempts_recent_idx;

-- Kiosk RPCs use the publishable anonymous session; signed-in managers do not need them.
revoke execute on function public.public_site_list() from authenticated;
revoke execute on function public.staff_lookup(text) from authenticated;
revoke execute on function public.staff_clock(text,text) from authenticated;
revoke execute on function public.staff_request_holiday(text,jsonb) from authenticated;
revoke execute on function public.staff_set_pin(text,text) from authenticated;
revoke execute on function public.staff_clock_photo(text,text,text) from authenticated;

drop policy if exists "upper management shared data" on public.shift_board;
create policy "upper management shared data" on public.shift_board
for all to authenticated
using (
  ((select auth.jwt())->'app_metadata'->>'role')='super'
  and (key<>'bonusSheets' or lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com'))
)
with check (
  ((select auth.jwt())->'app_metadata'->>'role')='super'
  and (key<>'bonusSheets' or lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com'))
);

drop policy if exists "managers view scoped photos" on public.clock_photos;
create policy "managers view scoped photos" on public.clock_photos
for select to authenticated
using (
  ((select auth.jwt())->'app_metadata'->>'role')='super'
  or (((select auth.jwt())->'app_metadata'->>'role')='site'
      and site_id=((select auth.jwt())->'app_metadata'->>'siteId'))
);
drop policy if exists "upper management delete photos" on public.clock_photos;
create policy "upper management delete photos" on public.clock_photos
for delete to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='super');

drop policy if exists "managers view scoped sales snapshots" on public.sales_daily_snapshots;
create policy "managers view scoped sales snapshots" on public.sales_daily_snapshots
for select to authenticated
using (
  ((select auth.jwt())->'app_metadata'->>'role')='super'
  or (
    ((select auth.jwt())->'app_metadata'->>'role')='site'
    and site_key = case ((select auth.jwt())->'app_metadata'->>'siteId')
      when 's7' then 'chester-le-street' when 's6' then 'fairfield'
      when 's5' then 'gateshead' when 's4' then 'hartlepool'
      when 's8' then 'lido' when 's3' then 'middlesbrough'
      when 's2' then 'peterlee' when 's1' then 'seaham' else '__none__' end
  )
);

drop policy if exists "upper management views audit" on public.shift_board_audit;
create policy "upper management views audit" on public.shift_board_audit
for select to authenticated
using (((select auth.jwt())->'app_metadata'->>'role')='super');

drop policy if exists "Tony views backups" on public.shift_board_backups;
create policy "Tony views backups" on public.shift_board_backups
for select to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='tony@neautoservices.com');
