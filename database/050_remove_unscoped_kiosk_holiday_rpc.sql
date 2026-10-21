-- A legacy kiosk read RPC accepted only a site ID, which is not an
-- authorization credential. Retire it so only the token-bound RPC is callable.
drop function if exists public.kiosk_holidays_month(text,text);
