-- Read-only, privileged outbound notification queue for senior-authorised holidays.
-- The site mail dispatcher is a connected Outlook automation; mailbox credentials
-- are NOT exposed to Shiftboard's browser or database.
-- Bootstraps at installation time so historical approvals are never re-emailed.
create table if not exists public.holiday_site_email_start (
 id integer primary key check(id=1),
 enabled_from timestamptz not null default now()
);
insert into public.holiday_site_email_start(id) values(1) on conflict(id) do nothing;
create table if not exists public.holiday_site_email_sent (
 request_id text not null,
 decided_at_ms bigint not null,
 site_email text not null,
 sent_at timestamptz not null default now(),
 primary key(request_id,decided_at_ms)
);
create index if not exists holiday_site_email_sent_time_idx
 on public.holiday_site_email_sent(sent_at desc);
alter table public.holiday_site_email_start enable row level security;
alter table public.holiday_site_email_sent enable row level security;
revoke all on public.holiday_site_email_start from public,anon,authenticated;
revoke all on public.holiday_site_email_sent from public,anon,authenticated;

create or replace function public.internal_pending_holiday_site_emails()
returns table(
 request_id text, decided_at_ms bigint,
 employee_name text, site_name text, site_email text,
 approved_dates jsonb, authorised_by text
)
language sql stable security definer set search_path = ''
as $$
 with config as (
  select value from public.shift_board where key='config'
 ),
 requests as (
  select request from public.shift_board b
  cross join lateral pg_catalog.jsonb_array_elements(
    case when jsonb_typeof(b.value)='array' then b.value else '[]'::jsonb end
  ) request
  where b.key='holidayRequests'
 ),
 candidates as (
  select r.request->>'id' as request_id,
   (r.request->>'decidedAt')::bigint as decided_at_ms,
   r.request->>'employeeId' as employee_id,
   coalesce(nullif(r.request->>'approvedSiteId',''),'') as approved_site_id,
   r.request->'dates' as dates,
   r.request->>'authorisedBy' as authorised_by
  from requests r cross join public.holiday_site_email_start st
  where r.request->>'status'='approved'
   and coalesce(r.request->>'id','')<>''
   and coalesce(r.request->>'authorisedBy','')<>''
   and coalesce(r.request->>'decidedAt','') ~ '^[0-9]{12,14}$'
   and pg_catalog.to_timestamp((r.request->>'decidedAt')::double precision/1000) >= st.enabled_from
 ),
 resolved as (
  select c.request_id,c.decided_at_ms,c.authorised_by,c.dates,
   e->>'name' as employee_name,
   coalesce(nullif(c.approved_site_id,''),e->>'siteId') as site_id
  from candidates c cross join config cfg
  cross join lateral pg_catalog.jsonb_array_elements(cfg.value->'employees') e
  where e->>'id'=c.employee_id
 ),
 mapped as (
  select r.*,
   case r.site_id
    when 's1' then 'seaham@neautoservices.com'
    when 's2' then 'peterlee@neautoservices.com'
    when 's3' then 'middlesbrough@neautoservices.com'
    when 's4' then 'hartlepool@neautoservices.com'
    when 's5' then 'gateshead@neautoservices.com'
    when 's6' then 'fairfield@neautoservices.com'
    when 's7' then 'chesterlestreet@neautoservices.com'
    when 's8' then 'lido@neautoservices.com'
    else null end as site_email,
   case r.site_id
    when 's1' then 'Seaham' when 's2' then 'Peterlee'
    when 's3' then 'Middlesbrough' when 's4' then 'Hartlepool'
    when 's5' then 'Gateshead' when 's6' then 'Fairfield'
    when 's7' then 'Chester-le-Street' when 's8' then 'Lido'
    else null end as site_name
  from resolved r
 )
 select m.request_id,m.decided_at_ms,m.employee_name,m.site_name,
        m.site_email,m.dates,m.authorised_by
 from mapped m
 where m.site_email is not null
  and m.employee_name is not null
  and jsonb_typeof(m.dates)='array'
  and jsonb_array_length(m.dates)>0
  and not exists (
    select 1 from public.holiday_site_email_sent sent
    where sent.request_id=m.request_id and sent.decided_at_ms=m.decided_at_ms
  )
 order by m.decided_at_ms
 limit 50;
$$;
revoke all on function public.internal_pending_holiday_site_emails() from public,anon,authenticated;

create or replace function public.internal_mark_holiday_site_email_sent(
 p_request_id text,p_decided_at_ms bigint,p_site_email text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if p_site_email not in ('seaham@neautoservices.com','peterlee@neautoservices.com',
 'middlesbrough@neautoservices.com','hartlepool@neautoservices.com',
 'gateshead@neautoservices.com','fairfield@neautoservices.com',
 'chesterlestreet@neautoservices.com','lido@neautoservices.com')
 then raise exception 'unrecognised recipient'; end if;
 if not exists(
  select 1 from public.internal_pending_holiday_site_emails() n
  where n.request_id=p_request_id and n.decided_at_ms=p_decided_at_ms and n.site_email=p_site_email
 ) then raise exception 'approval notification is not pending'; end if;
 insert into public.holiday_site_email_sent(request_id,decided_at_ms,site_email)
 values(p_request_id,p_decided_at_ms,p_site_email)
 on conflict(request_id,decided_at_ms) do nothing;
end
$$;
revoke all on function public.internal_mark_holiday_site_email_sent(text,bigint,text)
 from public,anon,authenticated;
comment on function public.internal_pending_holiday_site_emails() is
 'Service-only queue of newly senior-approved holidays. Site recipient is mapped from trusted s1-s8 IDs; never expose it to client calls.';
