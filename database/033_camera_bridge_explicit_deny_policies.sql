create policy "camera bridge pairings deny clients"
on public.camera_bridge_pairings
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "camera bridges deny clients"
on public.camera_bridges
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
