-- pgcrypto is installed in Supabase's extensions schema.
-- Keep the hardened search path while allowing the PIN fingerprint functions
-- to resolve extensions.digest(text, text).
alter function public.pin_guard(text)
  set search_path = public, extensions, pg_temp;

alter function public.pin_record(text, boolean, text)
  set search_path = public, extensions, pg_temp;
