create table if not exists public.camera_bridge_pairings (
  site_id text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.camera_bridges (
  site_id text primary key,
  public_base_url text not null,
  path_token text not null,
  bridge_token_hash text not null,
  channels integer not null default 16 check (channels between 1 and 32),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.camera_bridge_pairings enable row level security;
alter table public.camera_bridges enable row level security;

revoke all on table public.camera_bridge_pairings from anon, authenticated;
revoke all on table public.camera_bridges from anon, authenticated;

comment on table public.camera_bridge_pairings is
  'Short-lived one-time pairing codes for site camera bridge installers. Service-role only.';

comment on table public.camera_bridges is
  'Current camera bridge endpoint metadata. Service-role only; never stores DVR credentials.';
