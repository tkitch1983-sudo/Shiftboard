-- DRAFT ONLY: do not apply until automated Motasoft read access, ownership
-- mapping and GDPR/retention policy have been confirmed. No live migration.
-- Private read-only replica: user-facing access restricted to super users.
create table if not exists public.motasoft_diary_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_key text not null check (site_key in ('chester-le-street','fairfield','gateshead','hartlepool','lido','middlesbrough','peterlee','seaham')),
  tab text not null check (tab in ('MOT Tests','Service & Repairs')),
  diary_date date not null,
  captured_at timestamptz not null,
  slot_count int not null check (slot_count >= 0),
  slot_rows jsonb not null check (jsonb_typeof(slot_rows) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists motasoft_diary_snapshots_recent
  on public.motasoft_diary_snapshots(site_key,tab,diary_date,captured_at desc);
alter table public.motasoft_diary_snapshots enable row level security;
revoke all on public.motasoft_diary_snapshots from public, anon, authenticated;
grant select on public.motasoft_diary_snapshots to authenticated;
grant all on public.motasoft_diary_snapshots to service_role;
create policy motasoft_diary_super_read on public.motasoft_diary_snapshots
for select to authenticated using (
  (select auth.uid()) is not null and
  (select auth.jwt()->'app_metadata'->>'role') = 'super'
);
-- No authenticated insert/update/delete policies by design. The proposed
-- isolated backend sync service would insert with a server-only credential.
-- Sync health and retention cleanup are required before production use.
