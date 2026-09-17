alter function public.has_portal_tab_permission(text) security invoker;

drop policy if exists "Users see own additional permissions" on public.portal_tab_permissions;
create policy "Users see own additional permissions"
on public.portal_tab_permissions for select to authenticated
using (
  lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com'
  or email = lower(coalesce((select auth.jwt())->>'email',''))
);

drop policy if exists "Tony manages additional permissions" on public.portal_tab_permissions;
drop policy if exists "Tony inserts additional permissions" on public.portal_tab_permissions;
drop policy if exists "Tony updates additional permissions" on public.portal_tab_permissions;
drop policy if exists "Tony deletes additional permissions" on public.portal_tab_permissions;
create policy "Tony inserts additional permissions" on public.portal_tab_permissions for insert to authenticated
with check (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com' and lower(granted_by) = 'tony@neautoservices.com');
create policy "Tony updates additional permissions" on public.portal_tab_permissions for update to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com')
with check (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com' and lower(granted_by) = 'tony@neautoservices.com');
create policy "Tony deletes additional permissions" on public.portal_tab_permissions for delete to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com');

drop policy if exists "Tony manages MOT imports" on public.mot_imports;
drop policy if exists "Tony inserts MOT imports" on public.mot_imports;
drop policy if exists "Tony updates MOT imports" on public.mot_imports;
drop policy if exists "Tony deletes MOT imports" on public.mot_imports;
create policy "Tony inserts MOT imports" on public.mot_imports for insert to authenticated
with check (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com' and lower(uploaded_by) = 'tony@neautoservices.com');
create policy "Tony updates MOT imports" on public.mot_imports for update to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com')
with check (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com' and lower(uploaded_by) = 'tony@neautoservices.com');
create policy "Tony deletes MOT imports" on public.mot_imports for delete to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) = 'tony@neautoservices.com');
