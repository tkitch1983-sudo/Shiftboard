# Motasoft VGM → Shiftboard diaries (foundation, NOT live)

This folder records the eight VGM websites supplied for North East Auto Services. All eight use **different login accounts**. Each has two requested diary views: **MOT Tests** and **Service & Repairs**. Desired refresh: every 15 minutes, automatically, without staff exports or an API.

**Status:** This is a non-operational foundation. No Motasoft authentication, browser extraction, data sync, Supabase migration, or Shiftboard diary UI is currently enabled by these files.

## Critical checks before activation

1. Obtain Motasoft's permission for an unattended, rate-limited, read-only browser client. Respect provider restrictions, MFA and CAPTCHA; do not bypass access controls.
2. Verify the precise login and diary DOM through an authorised test session at Seaham. Screenshots show columns Time, Notes, Status, Modified, User, Bay, Type, MOT, Customer, but do not reveal stable DOM selectors, row IDs, registration numbers, or an authenticated export endpoint. Do not promise vehicle registration until confirmed.
3. Confirm whether the **Easington** Motasoft website maps to Shiftboard's **Peterlee** site key. `sites.json` deliberately leaves its `shiftboardSiteKey` null. The sync must refuse to ingest this site until confirmed.
4. Use an isolated scheduled browser runner with one secure credential pair per site (never in source, browser-visible JavaScript, a screenshot, logs, or ChatGPT). No privileged Supabase key may be sent to the browser page. Prefer purpose-limited VGM accounts and a secrets manager.
5. Collect each site+diary+date as a complete, versioned snapshot. Preserve duplicate times, inserted slots, bay and job type. **Do not infer booking status or capacity from red/white colours**; verify VGM semantics first. On parsing/login failure, keep the prior snapshot and mark the data stale, not empty or cancelled.
6. Keep customer data minimal and restrict access to management; verify GDPR retention, customer consent/legitimate interest, and audit rules before storing personal details. No screenshots containing PII should be put in GitHub or CI logs.
7. After extraction is verified, add a protected server ingest endpoint, migration (draft in `database/054_motasoft_diary_snapshots_DRAFT.sql`), heartbeat/error monitoring, and Shiftboard read-only 8-site UI. Never issue any VGM write/save/delete action.

## Safe parser and tests

`node --test integrations/motasoft/snapshot-parser.test.mjs`

`snapshot-parser.mjs` normalises an already-extracted snapshot. It is deliberately strict and does not authenticate, navigate, export, or scrape a live website. Real HTML/DOM extraction must be developed against a permitted authenticated test session; the screenshots alone are insufficient.

## Source data

`sites.json`: eight user-supplied URLs; no passwords. `shiftboardSiteKey` matches the existing Shiftboard site keys except Easington, which is unresolved. The supplied Lido URL ends at `/` and is intentionally preserved rather than guessed to be `/Default.aspx`.
