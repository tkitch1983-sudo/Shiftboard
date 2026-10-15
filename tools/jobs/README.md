# Jobs Per Day: historical Profit Tracker import

**Status: development branch only. Do not deploy until validation.**

## Definitions

Total jobs: unique positive invoice job reference per workshop and invoice date. Multiple invoices for the same job on the same date count once; credit notes do not add a job but affect sales reconciliation.

Service/repair: subset of total jobs. An invoice with a Labour line is provisionally coded service/repair, but the rule is NOT definitive: tyre fitting or MOT work may also carry labour. Management must validate classifications before verifying imported reports.

Needs review: Fixed Price without Labour, or unknown categories. Review jobs remain in Total Jobs, but are not included in service/repair. MOT-only, tyre-only and parts-only count in Total only.

Missing daily sheets are UNKNOWN, not zero. Reissued/corrected reports must replace the selected verified version rather than be added to it. Flag cross-date job-reference repeats for review.

## Eight-site pilot

Manually retrieved and parsed the 13 October 2026 Profit Tracker PDFs for all eight workshops. All eight reconciled to their corresponding net-sales report totals; one file included a credit note. Do not commit private job references, sales or copies of the emails/PDFs to this public repository.

**14 October 2026 backfill start:** A separate, additive database migration was applied to the Northeastautoservices Supabase staging schema (the production project, but no existing reporting data was modified). Five Profit Tracker PDFs dated **12 October 2024** were staged: Chester-le-Street, Fairfield, Gateshead (the attachment was named `MAR.pdf`), Middlesbrough, Peterlee. The staged database contains **52 job/invoice records across five branches** for that day, all reconciled. The Hartlepool email had a payment-only PDF and remains uncounted; no corresponding Seaham/Lido source sheet was established for that day. All five batches are **staged**, none **verified**; the dashboard shows **zero published historical rows** pending classification review. The original Outlook message/attachment IDs and timestamps were retained in the database but not committed to GitHub.

## Implementation

- tools/jobs/import_profit_tracker.py: offline, read-only PDF parser. Captures invoice/job references, categories, source checksum and reconciliation status; rejects multi-day reports.
- tools/jobs/stage_import.py: dry run by default. Explicit --stage uses a service-role secret on a trusted server to stage data. It does NOT verify or publish data.
- tools/jobs/backfill_outlook_graph.py: resumable seven-day-window Microsoft Graph mailbox import. **Tony's `day sheets ` folder** (folder name includes trailing space in Outlook) is used for all allowed workshop senders **except Lido**; **Lido emails are read from Tony's Inbox only**. The runner locates Day Sheets by a whitespace-trimmed case-insensitive folder name or accepts `--day-sheets-folder-id`; checks PDF contents, stages reconciled reports, and resumes from a private checkpoint. Requires securely supplied `GRAPH_ACCESS_TOKEN`/`GRAPH_MAILBOX`; the ChatGPT Outlook connector's token is not exportable to this script.
- database/034_jobs_per_day_history.sql: proposed RLS-protected import tables and a verified-only daily summary view.
- jobs-per-day.js: read-only Jobs Per Day management tab, date/site controls and category/review totals.
- index.html and sw.js: navigation and script installation.

## Local test and usage

    python -m pip install pymupdf
    python -m unittest discover -s tools/jobs/tests -v
    python tools/jobs/import_profit_tracker.py --site hartlepool --summary-only /path/to/profit.pdf
    python tools/jobs/stage_import.py --site hartlepool /path/to/profit.pdf

Only the staging script, when explicitly supplied --stage with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a secure server environment, writes staged data. NEVER expose the service-role key to a browser or commit it to GitHub.

## Before production

1. Agree the exact servicing/repair classification, especially Labour+Tyres, Labour+MOT and Fixed Price cases.
2. Validate at least one full Monday-Saturday week from all eight sites; review duplicates, credits and document corrections.
3. Test the migration, role scoping (super versus site) and dates/zero versus missing in a separate Supabase environment.
4. Stage and reconcile a reviewed sample; add a secure, audited management approval workflow before setting batches to verified.
5. Test the dashboard with verified sample data; confirm it shows uncertainty and missing reports clearly.
6. Backfill 2026, 2025 and available 2024 email PDFs in bounded batches with per-site coverage reporting.
7. Configure secure Outlook/Graph mailbox-read ingestion with sender allow-list, attachment validation, retry alerts and rotated credentials. Ingestion should stage data; it should not auto-verify.
8. Add Boardroom figures only after history is approved.

## Current limitations

Historical **bulk** backfill, secure Outlook Graph authentication, automatic scheduled ingestion, live dashboard test and management classification review are NOT complete. The database schema has been applied and five earliest reports staged, but no data is published. GitHub remains a draft development PR; the live Shiftboard web front end has not changed.

**Folder confirmation (14 Oct 2026):** The connected Outlook mailbox has exactly one match for `day sheets `, containing **3,937 items**. Its first messages date from 12 October 2024. Recent Lido daily emails were confirmed in Inbox using a sender-filtered mail listing. Neither observation proves every workshop day is complete; the import must report coverage gaps.


## iPhone Outlook connection (14 October 2026)

Microsoft Entra app registration "Shiftboard jobs import" is single-tenant and uses delegated `Mail.Read` / `User.Read` permissions with public client (device code) flows enabled. No app client secret is needed.

The hosted `shiftboard-outlook-connect` Supabase Edge Function serves a mobile page at `https://disgpocvqitpeceqhuim.supabase.co/functions/v1/shiftboard-outlook-connect`. It is **not a public connect URL without a separate, private one-use invitation**. Invites are 64-character random hex fragments stored as SHA-256 digests in `jobs_outlook_connect_invites`, expire after 48 hours, and are marked consumed on successful connection. The fragment is not transmitted with the initial GET request.

When the invite holder taps Start, the service requests a Microsoft device sign-in code from the configured tenant/client application. The user signs in on `https://microsoft.com/devicelogin` and returns to the page. A server-side poll obtains the access/refresh tokens and verifies that Microsoft Graph `/me` matches Tony's exact mailbox. Tokens are never delivered to the browser. The server encrypts the refresh token using AES-GCM and a server-secret-derived key and stores it in the service-role-only `jobs_outlook_mailbox_connections` table.

**Security restrictions:** Anonymous and authenticated users have no table permissions or RLS policies; only the Supabase server-side service role may access stored credentials. The function uses its own one-time invite checks and deliberately has `verify_jwt=false` so the page can be visited from an iPhone without first logging into Supabase. The page has a restrictive content security policy and no permissive cross-origin response headers. Rotate a key only after providing a reconnect flow; key rotation without re-encryption renders existing ciphertext unreadable.

**Status:** The edge connection page and database tables have been deployed. The token exchange awaits an actual Tony sign-in, and no historical backfill is triggered simply by connecting. The secure Outlook/Graph history runner still needs to be wired up to consume the stored refresh token and scheduled securely. The user should not be told that historical import is running until it is.

## Connection page repair (14 October 2026)

- The original Supabase function GET returned HTML as `text/plain` in mobile Safari. The sign-in UI was therefore moved to `https://northeastautoservices.pages.dev/outlook-connect`; the function now redirects GET and restricts POST CORS to that exact Cloudflare Pages origin.
- The isolated connection HTML/CSS/JavaScript and matching `_headers` were deployed on Cloudflare Pages, without merging the draft Jobs Per Day dashboard. The existing production service worker was patched to exclude the new /outlook-connect route and its assets from app-shell caching and script injection.
- On an actual iPhone visit, Start initially showed `Connection service temporarily unavailable`. Function logs showed a 400 when inserting into `jobs_outlook_connect_sessions`. The cause was that the function inserted `verification_uri` but migration 035 had omitted that column. Migration `036_jobs_outlook_device_verification_uri.sql` has since been applied and the missing column confirmed. No earlier sign-in session was persisted.
- **Do not claim an end-to-end Microsoft token exchange has been tested** until the user retries and the server confirms a connected mailbox row. Original user invitation remains valid until its TTL.


## Live staged-only historical backfill (14 October 2026)

The new **Supabase Edge Function** \`shiftboard-jobs-backfill\` reads Tony's encrypted delegated Graph refresh token **server-side**, rotates it, discovers the Day Sheets folder and reads seven workshop senders from there. It reads only Lido sender messages from Tony's Inbox. The function extracts Profit Tracker text using \`unpdf\`, validates the PDF daily reporting date, de-duplicates invoice/job references, includes credit values in sales reconciliation, and stages only fully reconciled PDFs.

- \`database/037_jobs_backfill_runner.sql\`: private random-key-protected \`pg_net\` trigger and \`jobs_backfill_run_audit\` table. No public or ordinary authenticated access.
- \`database/038_jobs_history_backfill_dispatcher.sql\`: a day-by-day dispatcher with an advisory lock and idempotent date selection. \`cron.job\` name \`jobs-history-archive\` calls it every two minutes. It stops itself after the received-date archive through 13 October 2026 has been attempted.
- Each received-day audit records discovered reports, staged reports, skipped/missing site labels and parser/reconciliation errors; missing days are **never zero jobs**. Failed reports can be investigated and retried manually. Cron does not automatically reprocess an audited day.
- The runner's direct HTTP endpoint has \`verify_jwt=false\` because it enforces its own **private 256-bit server-to-server shared key** in \`x-shiftboard-run-key\`. The key is never included in the repository, client-side code, or user-visible dashboard.
- The first read-only comparison on **12 October 2024** found all five known PDFs and staged **zero duplicate reports**. **14 October 2024** produced six reconciled reports and 85 unique jobs (staged). **13 October 2026** produced eight reconciled PDFs and 119 unique jobs, exactly matching the original manual pilot. All data remains staged, not verified.
- Some archived PDFs are genuinely multi-day or fail sum reconciliation; these are logged and do not generate a provisional zero or invented job count. A separate exception-review process is required before management approval.
- GitHub CI tests exercise the edge importer TypeScript and a synthetic invoice/credit fixture; see \`parser_test.ts\`. No production frontend jobs dashboard has been merged.

**Operational checks** (restricted Supabase SQL editor):

~~~sql
select jobname,active,schedule from cron.job where jobname='jobs-history-archive';
select report_day,status,reports_found,reports_staged,errors
from public.jobs_backfill_run_audit order by report_day desc limit 20;
select count(*) as staged from public.jobs_import_batches where status='staged';
select count(*) as visible from public.jobs_daily_summary;
~~~

**Stop if necessary:** \`select cron.unschedule('jobs-history-archive');\`. This stops future import jobs; it does not erase any staged data. Reconcile all exceptions and review service/repair category rules before verifying batches.


## New daily Outlook collection (15 October 2026)

**Deployed and enabled independently of archive backfill.**

- Migration `database/041_jobs_new_daily_outlook_schedule.sql` added two active Supabase pg_cron jobs:
  - `jobs-daily-inbox`: hourly, minute 01 UTC; scans the **current UTC received date** in Tony's Day Sheets folder and Lido's Inbox.
  - `jobs-daily-prior-day`: every day at 05:31 UTC; rechecks **yesterday's UTC received date** for late previous-evening emails.
- Both call existing restricted `jobs_trigger_backfill_day` / Edge Function and use its server-only Outlook refresh token, PDF parsing, deduplication, strict PDF net-sales reconciliation and staging audit. **All calendar days including weekends.**
- Dates scanned are **Outlook received dates**; report date recorded in the database comes from the PDF's invoice/Date Range field. A report received the following day can still be counted against its correct invoice date.
- The historical archive's separate `jobs-history-archive` cron is unchanged and will stop itself at the archive end; **the daily schedules remain active afterwards**.
- Verification on 15 October: manual current/prior-day wrapper invocations completed successfully. Scanning received date **14 October 2026** found seven reconciled workshop PDFs (76 total jobs; one report per branch except Hartlepool), and an immediate re-scan found all seven and staged zero duplicates. Scanning received date **15 October** at 06:34 UK found no qualifying PDF so far, as expected early in the morning. Hartlepool's 14 Oct PDF remains a source-coverage gap requiring follow-up; do not substitute zero.
- The live Jobs Report's initial filter now prioritises latest new invoice-day reports after 13 Oct 2026; the separate 'View imported history' option continues to track 2024+ archive.
- `jobs-daily-inbox` and `jobs-daily-prior-day` are active but at deployment time had not yet fired **on their cron ticks**; confirm after the next `:01` tick by reading `cron.job_run_details`. Manual dispatcher end-to-end runs succeeded.

### Daily operations

~~~sql
select jobname,active,schedule from cron.job where jobname like 'jobs-daily-%';
select j.jobname,d.status,d.start_time from cron.job j
left join lateral (select status,start_time from cron.job_run_details
where jobid=j.jobid order by start_time desc limit 1) d on true
where j.jobname like 'jobs-daily-%';
select report_day,status,reports_found,reports_staged,completed_at
from public.jobs_backfill_run_audit
where report_day >= current_date-2 order by started_at desc;
~~~

**If intake must be stopped** (requires privileged SQL editor): unschedule jobs individually with `select cron.unschedule('jobs-daily-inbox');` and `select cron.unschedule('jobs-daily-prior-day');`. This never deletes staged history.
