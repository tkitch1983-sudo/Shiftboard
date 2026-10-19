-- Server-only deduplication and audit for Tony's manual director-email button.
create table public.director_manual_sends (
  snapshot_id text primary key,
  report_date date not null,
  requested_by uuid not null references auth.users(id),
  recipient text not null default 'tony@neautoservices.com' check (recipient='tony@neautoservices.com'),
  status text not null check(status in ('sending','submitted','unknown')),
  requested_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.director_manual_sends enable row level security;
revoke all on public.director_manual_sends from public,anon,authenticated;
grant all on public.director_manual_sends to service_role;
