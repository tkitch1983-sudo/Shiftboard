#!/usr/bin/env python3
"""Dry-run by default. Stage a Profit Tracker PDF using server-side service-role access.

Example:
 python tools/jobs/stage_import.py --site hartlepool report.pdf
 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python tools/jobs/stage_import.py --site hartlepool report.pdf --stage

Do not embed a service-role credential in Shiftboard's browser JavaScript.
Staging is not verification: only human-approved data may be marked verified.
"""
import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from import_profit_tracker import parse


def api(endpoint, key, method, path, payload=None, prefer=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"apikey": key, "Authorization": "Bearer " + key,
               "Content-Type": "application/json", "Accept": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(endpoint.rstrip("/") + "/rest/v1/" + path,
                                 data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            value = response.read()
            return json.loads(value) if value else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Supabase refused " + method + " " +
                           path.split("?")[0] + ": HTTP " + str(exc.code)) from exc


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("file")
    cli.add_argument("--site", required=True)
    cli.add_argument("--stage", action="store_true", help="Explicitly stage; never automatically verify")
    args = cli.parse_args()
    result = parse(args.file, args.site)
    print(json.dumps({k: v for k, v in result.items() if k not in ("jobs", "entries")}, indent=2))
    if not result["sales_reconciled"] or result["unknown_categories"]:
        raise SystemExit("REFUSED: report requires investigation")
    if not args.stage:
        print("DRY RUN: no database changes. Add --stage after reviewing the figures.")
        return
    endpoint = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not endpoint.startswith("https://") or not key:
        raise SystemExit("Set SUPABASE_URL (HTTPS) and SUPABASE_SERVICE_ROLE_KEY server-side")
    lookup = ("jobs_import_batches?select=id,status&site_key=eq." +
              urllib.parse.quote(args.site) + "&report_date=eq." + result["report_date"] +
              "&source_sha256=eq." + result["source_sha256"] + "&limit=1")
    existing = api(endpoint, key, "GET", lookup) or []
    if existing and existing[0]["status"] == "verified":
        raise SystemExit("Existing verified import cannot be changed")
    record = {
        "site_key": result["site_key"], "report_date": result["report_date"],
        "source_sha256": result["source_sha256"], "source_filename": result["source_file"],
        "status": "staged", "report_sales_ex_vat": result["report_sales_ex_vat"],
        "calculated_sales_ex_vat": result["calculated_sales_ex_vat"],
        "sales_reconciled": result["sales_reconciled"],
        "warnings": [{"type": "service_review_pending",
                      "count": result["service_repair_to_review"]}],
    }
    if existing:
        batch_id = existing[0]["id"]
    else:
        created = api(endpoint, key, "POST", "jobs_import_batches", [record], "return=representation")
        batch_id = created[0]["id"]
    rows = [{"batch_id": batch_id, "site_key": result["site_key"],
             "report_date": result["report_date"], **entry}
            for entry in result["entries"]]
    if rows:
        api(endpoint, key, "POST", "jobs_import_entries?on_conflict=batch_id,invoice_number",
            rows, "resolution=merge-duplicates,return=minimal")
    print("Staged " + str(len(rows)) + " invoice/credit records; NOT VERIFIED or published.")


if __name__ == "__main__":
    main()
