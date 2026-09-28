drop policy if exists "Tony inserts MOT imports" on public.mot_imports;
drop policy if exists "Tony updates MOT imports" on public.mot_imports;
drop policy if exists "Tony deletes MOT imports" on public.mot_imports;
drop policy if exists "Tony or Neil inserts MOT imports" on public.mot_imports;
drop policy if exists "Tony or Neil updates MOT imports" on public.mot_imports;
drop policy if exists "Tony or Neil deletes MOT imports" on public.mot_imports;

create policy "Tony or Neil inserts MOT imports"
on public.mot_imports for insert to authenticated
with check (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','neil@neautoservices.com')
  and lower(uploaded_by) = lower(coalesce((select auth.jwt())->>'email',''))
);

create policy "Tony or Neil updates MOT imports"
on public.mot_imports for update to authenticated
using (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','neil@neautoservices.com')
)
with check (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','neil@neautoservices.com')
  and lower(uploaded_by) = lower(coalesce((select auth.jwt())->>'email',''))
);

create policy "Tony or Neil deletes MOT imports"
on public.mot_imports for delete to authenticated
using (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','neil@neautoservices.com')
);
