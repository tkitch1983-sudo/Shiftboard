alter table public.jobs_invoice_documents
 add column invoice_job_type text check(invoice_job_type in ('tyre_only','mixed','other','uncertain')),
 add column invoice_type_reason text,
 add column invoice_type_version integer,
 add column invoice_scanned_at timestamptz;
comment on column public.jobs_invoice_documents.invoice_job_type is 'Conservative classification from original PDF work and item descriptions; uncertain remains in review.';
