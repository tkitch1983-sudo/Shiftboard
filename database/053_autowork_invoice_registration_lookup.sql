-- Invoice Checker: Tony-only registration to AutoWork invoice lookup index.
-- Records are imported from an AutoWork invoice export; this table never edits invoices in AutoWork.
create table if not exists public.autowork_invoice_lookup (
  site_key text not null check (site_key in (
    'seaham','peterlee','middlesbrough','hartlepool',
    'gateshead','fairfield','chester-le-street','lido'
  )),
  invoice_number text not null check (length(invoice_number) between 1 and 60),
  registration text not null check (registration ~ '^[A-Z0-9]{4,12}$'),
  invoice_date date,
  job_number text,
  total_amount numeric(12,2),
  net_amount numeric(12,2),
  source_file text not null,
  imported_by text not null default lower(coalesce(auth.jwt()->>'email','')),
  imported_at timestamptz not null default now(),
  primary key (site_key, invoice_number)
);
create index if not exists autowork_invoice_lookup_registration_idx
  on public.autowork_invoice_lookup(registration, invoice_date desc);
comment on table public.autowork_invoice_lookup is
  'Registration, date and amount index from Tony-imported AutoWork invoice exports. Lookup evidence only; not a verified payment match.';

alter table public.autowork_invoice_lookup enable row level security;
revoke all on public.autowork_invoice_lookup from public, anon, authenticated;
grant select, insert, update on public.autowork_invoice_lookup to authenticated;
grant all on public.autowork_invoice_lookup to service_role;

create policy "Tony can read AutoWork invoice lookups"
on public.autowork_invoice_lookup for select to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),'')) = 'tony@neautoservices.com');

create policy "Tony can import AutoWork invoice lookups"
on public.autowork_invoice_lookup for insert to authenticated
with check (
  lower(coalesce((select auth.jwt()->>'email'),'')) = 'tony@neautoservices.com'
  and imported_by = 'tony@neautoservices.com'
);

create policy "Tony can correct AutoWork invoice lookups"
on public.autowork_invoice_lookup for update to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),'')) = 'tony@neautoservices.com')
with check (
  lower(coalesce((select auth.jwt()->>'email'),'')) = 'tony@neautoservices.com'
  and imported_by = 'tony@neautoservices.com'
);
