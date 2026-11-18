-- Server-only audit and atomic once-per-site/day/mode claim.
create table public.shiftboard_checklist_reminder_log (
 reminder_date date not null, site_id text not null, mode text not null check (mode in ('test','live')),
 recipient_email text not null, requested_by uuid not null, week_start date not null, month_start date not null,
 items jsonb not null, status text not null check(status in ('claimed','submitted','uncertain')),
 requested_at timestamptz not null default now(), finished_at timestamptz,
 primary key(reminder_date,site_id,mode)
);
alter table public.shiftboard_checklist_reminder_log enable row level security;
revoke all on public.shiftboard_checklist_reminder_log from public,anon,authenticated;
grant select,insert,update on public.shiftboard_checklist_reminder_log to service_role;