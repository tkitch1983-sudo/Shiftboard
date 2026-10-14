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
- tools/jobs/backfill_outlook_graph.py: resumable seven-day-window Microsoft Graph mailbox import; reads only trusted branch senders, checks every PDF's contents, stages reconciled reports only, and can resume from private checkpoint. Requires securely supplied `GRAPH_ACCESS_TOKEN`/`GRAPH_MAILBOX`; the ChatGPT Outlook connector's token is not exportable to this script.
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
