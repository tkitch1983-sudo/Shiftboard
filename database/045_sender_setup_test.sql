alter table public.sender_outlook_connect_sessions
 add column test_status text not null default 'not_sent' check(test_status in ('not_sent','preparing','sending','accepted','rejected','failed','unknown')),
 add column test_attempted_at timestamptz,
 add column test_finished_at timestamptz,
 add column test_http_status integer;
