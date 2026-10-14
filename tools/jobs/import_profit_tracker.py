#!/usr/bin/env python3
"""Read-only, offline parser for single-day REPDATAB Profit Tracker PDFs.

Requires PyMuPDF (pip install pymupdf). Does not read Outlook, upload data,
or update Supabase. Report categories are not a job description: fixed-price
jobs without a Labour category remain pending manual classification.
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import fitz

HEADER = re.compile(
    r"Invoice/Credit Number\s+(?P<invoice>[A-Z][A-Z0-9-]*)\s+Job\s+(?P<job>[A-Z][A-Z0-9-]*)\s+Date\s+(?P<date>\d{2}/\d{2}/\d{4})", re.I)
CATEGORIES = {"Labour", "Parts", "MOT", "Fixed Price", "Tyres", "Discount"}
ROW_TYPE = re.compile(r"(?m)^[-+]?\d+(?:\.\d+)?%\s*\n([^\n]+)")


def gb_date(value):
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat()


def money(value):
    return Decimal(value.replace(",", ""))


def extract_line_total(block):
    lines = [x.strip() for x in block.splitlines()]
    for i in range(len(lines) - 1, -1, -1):
        if lines[i] == "Total" and i >= 4 and lines[i - 1].endswith("%"):
            try:
                return money(lines[i - 3])
            except Exception:
                pass
    return None


def parse(path, site_key):
    path = Path(path)
    if not re.fullmatch(r"[a-z][a-z-]+", site_key):
        raise ValueError("Invalid site key")
    with fitz.open(str(path)) as pdf:
        if pdf.page_count > 40:
            raise ValueError("Unexpected report length")
        text = "\n".join(page.get_text() for page in pdf)
    if not re.search(r"\bProfit Tracker\b", text, re.I):
        raise ValueError("Not a Profit Tracker report")
    dates = re.search(r"Date Range:\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})", text)
    if not dates or dates.group(1) != dates.group(2):
        raise ValueError("Report must cover one day only")
    report_date = gb_date(dates.group(1))
    hits = list(HEADER.finditer(text))
    if not hits:
        raise ValueError("No invoices or job references")
    jobs = {}
    entries = []
    credit_notes = []
    invoice_ids = set()
    unknown = set()
    total = Decimal("0")
    totals_ix = text.find("\nTotals\n")
    for i, hit in enumerate(hits):
        stop = hits[i + 1].start() if i + 1 < len(hits) else (totals_ix if totals_ix > hit.end() else len(text))
        block = text[hit.end():stop]
        invoice = hit.group("invoice").upper()
        job = hit.group("job").upper()
        date = gb_date(hit.group("date"))
        if date != report_date:
            raise ValueError("Invoice date differs from report date: " + invoice)
        if invoice in invoice_ids:
            raise ValueError("Duplicate invoice in source PDF: " + invoice)
        invoice_ids.add(invoice)
        categories = {x.strip() for x in ROW_TYPE.findall(block)} - {"Total"}
        if not categories:
            raise ValueError("No line categories: " + invoice)
        unknown.update(categories - CATEGORIES)
        sell = extract_line_total(block)
        if sell is None:
            raise ValueError("Missing invoice total: " + invoice)
        is_credit = invoice.startswith("C")
        if not is_credit and not invoice.startswith("I"):
            raise ValueError("Unknown invoice/credit prefix: " + invoice)
        entries.append({
            "site_key": site_key, "report_date": date,
            "invoice_number": invoice, "job_number": job,
            "transaction_kind": "credit" if is_credit else "invoice",
            "categories": sorted(categories), "sell_ex_vat": str(sell),
            "classification": "other",
        })
        if is_credit:
            credit_notes.append({"invoice_number": invoice, "job_number": job, "sell_ex_vat": str(sell)})
            continue
        total += sell
        rec = jobs.setdefault(job, {"job": job, "invoices": [], "categories": set(), "sales": Decimal("0")})
        rec["invoices"].append(invoice)
        rec["categories"].update(categories)
        rec["sales"] += sell
    rows = []
    for rec in jobs.values():
        categories = rec["categories"]
        if "Labour" in categories:
            classification = "service_repair"
        elif "Fixed Price" in categories or (categories - CATEGORIES):
            classification = "review"
        else:
            classification = "other"
        rows.append({
            "job": rec["job"], "invoices": sorted(rec["invoices"]),
            "categories": sorted(categories), "classification": classification,
            "sales_ex_vat": str(rec["sales"].quantize(Decimal("0.01"))),
        })
    rows.sort(key=lambda r: r["job"])
    job_classifications = {r["job"]: r["classification"] for r in rows}
    for entry in entries:
        if entry["transaction_kind"] == "invoice":
            entry["classification"] = job_classifications[entry["job_number"]]
    reported = extract_line_total(text.split("\nTotals\n")[-1])
    computed = total + sum(Decimal(x["sell_ex_vat"]) for x in credit_notes)
    reconciled = reported is not None and abs(computed - reported) <= Decimal("0.02")
    return {
        "site_key": site_key, "report_date": report_date,
        "source_file": path.name, "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "total_jobs": len(rows),
        "service_repair_confirmed": sum(r["classification"] == "service_repair" for r in rows),
        "service_repair_to_review": sum(r["classification"] == "review" for r in rows),
        "other_jobs": sum(r["classification"] == "other" for r in rows),
        "credit_notes_excluded": len(credit_notes),
        "unknown_categories": sorted(unknown),
        "report_sales_ex_vat": str(reported) if reported is not None else None,
        "calculated_sales_ex_vat": str(computed.quantize(Decimal("0.01"))),
        "sales_reconciled": reconciled,
        "jobs": rows, "entries": entries,
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("file", type=Path)
    cli.add_argument("--site", required=True, help="Canonical workshop site key")
    cli.add_argument("--summary-only", action="store_true")
    cli.add_argument("--output", type=Path)
    args = cli.parse_args()
    result = parse(args.file, args.site)
    if args.summary_only:
        result.pop("jobs")
        result.pop("entries")
    output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    if not result["sales_reconciled"] or result["unknown_categories"]:
        print("MANUAL REVIEW REQUIRED: sales reconciliation or unknown category", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
