-- Private staff pay rates. Only Tony and Jack can read or change payroll rates.
create table if not exists public.staff_pay_rates (
  employee_id text primary key,
  pay_rate numeric(10,2) not null check (pay_rate >= 0),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

alter table public.staff_pay_rates enable row level security;
revoke all on table public.staff_pay_rates from public, anon;
grant select, insert, update, delete on table public.staff_pay_rates to authenticated;

drop policy if exists "Tony and Jack view pay rates" on public.staff_pay_rates;
drop policy if exists "Tony and Jack insert pay rates" on public.staff_pay_rates;
drop policy if exists "Tony and Jack update pay rates" on public.staff_pay_rates;
drop policy if exists "Tony and Jack delete pay rates" on public.staff_pay_rates;

create policy "Tony and Jack view pay rates"
on public.staff_pay_rates for select to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com'));

create policy "Tony and Jack insert pay rates"
on public.staff_pay_rates for insert to authenticated
with check (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com')
  and lower(updated_by)=lower(coalesce((select auth.jwt())->>'email',''))
);

create policy "Tony and Jack update pay rates"
on public.staff_pay_rates for update to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com'))
with check (
  lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com')
  and lower(updated_by)=lower(coalesce((select auth.jwt())->>'email',''))
);

create policy "Tony and Jack delete pay rates"
on public.staff_pay_rates for delete to authenticated
using (lower(coalesce((select auth.jwt())->>'email','')) in ('tony@neautoservices.com','jack@neautoservices.com'));
