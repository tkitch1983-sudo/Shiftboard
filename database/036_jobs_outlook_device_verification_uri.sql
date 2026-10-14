-- Patch the Outlook device-sign-in session schema to match the deployed connection service.
-- The Microsoft verification URL is public. Never store Microsoft passwords in this table.
alter table public.jobs_outlook_connect_sessions
  add column if not exists verification_uri text not null default 'https://microsoft.com/devicelogin';
comment on column public.jobs_outlook_connect_sessions.verification_uri is
  'The official Microsoft device-code verification URL, not a token.';
