-- One-time Tony Outlook connection setup: private service-role tables.
create table if not exists public.jobs_outlook_connect_invites (
 id uuid primary key default gen_random_uuid(),
 token_sha256 text not null unique,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.jobs_outlook_connect_sessions (
 id uuid primary key default gen_random_uuid(),
 invite_id uuid not null unique references public.jobs_outlook_connect_invites(id) on delete cascade,
 device_ciphertext text not null,
 device_iv text not null,
 user_code text not null,
 interval_seconds integer not null default 5 check(interval_seconds between 5 and 60),
 expires_at timestamptz not null,
 last_polled_at timestamptz,
 status text not null default 'pending' check(status in ('pending','connected','expired','failed')),
 created_at timestamptz not null default now()
);
create table if not exists public.jobs_outlook_mailbox_connections (
 mailbox text primary key,
 encrypted_refresh_token text not null,
 refresh_iv text not null,
 client_id text not null,
 tenant_id text not null,
 granted_scopes text,
 connected_at timestamptz not null default now(),
 last_verified_at timestamptz not null default now()
);
alter table public.jobs_outlook_connect_invites enable row level security;
alter table public.jobs_outlook_connect_sessions enable row level security;
alter table public.jobs_outlook_mailbox_connections enable row level security;
revoke all on public.jobs_outlook_connect_invites from anon, authenticated;
revoke all on public.jobs_outlook_connect_sessions from anon, authenticated;
revoke all on public.jobs_outlook_mailbox_connections from anon, authenticated;
comment on table public.jobs_outlook_mailbox_connections is 'Server-side encrypted Graph connection, never readable by Shiftboard browser clients.';
