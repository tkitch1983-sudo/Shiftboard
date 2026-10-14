#!/usr/bin/env python3
"""Backfill Outlook Profit Tracker PDFs by *received* date; invoice date comes from PDF.

Requires a Microsoft Graph Mail.Read access token supplied securely as
GRAPH_ACCESS_TOKEN, and GRAPH_MAILBOX=me (delegated) or a permitted mailbox UPN.
Reads seven workshop senders from the "Day Sheets" folder and only Lido
from the Inbox. Discovers the folder by name (ignoring surrounding spaces).
By default makes NO Supabase writes. Pass --stage to write *staged* batches only.
The script never publishes or approves imported reports.

Example:
 GRAPH_ACCESS_TOKEN=... GRAPH_MAILBOX=me python tools/jobs/backfill_outlook_graph.py \
   --start 2024-10-12 --end 2024-10-19 --report ./private-review.json
 GRAPH_ACCESS_TOKEN=... GRAPH_MAILBOX=me SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... python tools/jobs/backfill_outlook_graph.py \
   --start 2024-10-12 --end 2026-10-14 --stage --checkpoint ./private-checkpoint.json

Never commit source PDFs, review files, tokens or checkpoint files.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from import_profit_tracker import parse
from graph_auth import GraphAuth

GRAPH_ROOT = "https://graph.microsoft.com/v1.0/"
SENDERS = {
    "seaham@neautoservices.com": "seaham",
    "peterlee@neautoservices.com": "peterlee",
    "middlesbrough@neautoservices.com": "middlesbrough",
    "hartlepool@neautoservices.com": "hartlepool",
    "gateshead@neautoservices.com": "gateshead",
    "fairfield@neautoservices.com": "fairfield",
    "chesterlestreet@neautoservices.com": "chester-le-street",
    "lido@neautoservices.com": "lido",
}
MAX_PDF_SIZE = 8 * 1024 * 1024


def parse_iso(value):
    return date.fromisoformat(value)


def windows(start, end, days=7):
    """Inclusive start/end as exclusive-ended, bounded calendar intervals."""
    d = start
    while d <= end:
        until = min(d + timedelta(days=days), end + timedelta(days=1))
        yield d.isoformat(), until.isoformat()
        d = until


def resolve_site(message):
    address = (((message.get("from") or {}).get("emailAddress") or {})
               .get("address") or "").strip().lower()
    return SENDERS.get(address)

def source_matches(site, folder_kind):
    """Lido belongs to Inbox; other workshop senders belong to Day Sheets."""
    return (folder_kind == "inbox" and site == "lido") or (
        folder_kind == "day_sheets" and site in SENDERS.values() and site != "lido")


class Graph:
    def __init__(self, token, mailbox):
        if not token:
            raise ValueError("GRAPH_ACCESS_TOKEN is required")
        self.token = token
        self.prefix = GRAPH_ROOT + ("me" if mailbox == "me"
                                    else "users/" + urllib.parse.quote(mailbox, safe="@"))

    def get(self, url, binary=False):
        if not url.startswith(GRAPH_ROOT):
            raise ValueError("Unsafe Graph paging URL refused")
        for attempt in range(6):
            req = urllib.request.Request(
                url, headers={"Authorization": "Bearer " + self.token,
                              "Accept": "application/json" if not binary else "application/octet-stream"})
            try:
                with urllib.request.urlopen(req, timeout=45) as res:
                    if binary and int(res.headers.get("Content-Length", "0")) > MAX_PDF_SIZE:
                        raise ValueError("PDF attachment is larger than size limit")
                    raw = res.read(MAX_PDF_SIZE + 1 if binary else 10 * 1024 * 1024)
                    if binary:
                        if len(raw) > MAX_PDF_SIZE:
                            raise ValueError("PDF attachment is larger than size limit")
                        return raw
                    return json.loads(raw)
            except urllib.error.HTTPError as e:
                if e.code not in (429, 503) or attempt == 5:
                    raise RuntimeError("Microsoft Graph failed: HTTP " + str(e.code)) from e
                delay = min(60, max(2, int(e.headers.get("Retry-After", "4"))))
                time.sleep(delay * (attempt + 1))
        raise RuntimeError("Microsoft Graph retries exhausted")

    def pages(self, first_url):
        url = first_url
        while url:
            result = self.get(url)
            yield from result.get("value", [])
            url = result.get("@odata.nextLink")

    def find_day_sheets_folder(self):
        """Find exactly one visible Day Sheets folder in Tony's mailbox."""
        queue = [None]
        matching = []
        visited = 0
        while queue:
            parent = queue.pop(0)
            if visited > 150:
                raise RuntimeError("Mail folder discovery limit exceeded")
            path = (self.prefix + "/mailFolders" if parent is None else
                    self.prefix + "/mailFolders/" + urllib.parse.quote(parent, safe="") + "/childFolders")
            url = path + "?" + urllib.parse.urlencode({
                "$select": "id,displayName,childFolderCount", "$top": "100"})
            for folder in self.pages(url):
                visited += 1
                if str(folder.get("displayName") or "").strip().casefold() == "day sheets":
                    matching.append(folder["id"])
                if folder.get("childFolderCount"):
                    queue.append(folder["id"])
        if len(matching) != 1:
            raise ValueError("Expected exactly one Day Sheets mail folder; found " +
                             str(len(matching)) + ". Supply --day-sheets-folder-id.")
        return matching[0]

    def messages(self, start, end, folder_id):
        query = urllib.parse.urlencode({
            "$select": "id,subject,from,receivedDateTime,hasAttachments",
            "$filter": "receivedDateTime ge " + start + "T00:00:00Z and receivedDateTime lt " +
                       end + "T00:00:00Z",
            "$top": "100",
        })
        folder_path = self.prefix + "/mailFolders/" + urllib.parse.quote(folder_id, safe="")
        yield from self.pages(folder_path + "/messages?" + query)

    def attachments(self, message_id):
        path = self.prefix + "/messages/" + urllib.parse.quote(message_id, safe="")
        return self.pages(path + "/attachments?" + urllib.parse.urlencode({
            "$select": "id,name,contentType,size,isInline",
            "$top": "100",
        }))

    def download(self, message_id, attachment_id):
        base = self.prefix + "/messages/" + urllib.parse.quote(message_id, safe="")
        return self.get(base + "/attachments/" + urllib.parse.quote(attachment_id, safe="") + "/$value",
                        binary=True)


def load_checkpoint(path):
    if not path or not path.exists():
        return set()
    return set(json.loads(path.read_text(encoding="utf-8")).get("completed_windows", []))


def save_checkpoint(path, completed):
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps({"completed_windows": sorted(completed)}, indent=2),
                         encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--start", default="2024-10-12", type=parse_iso)
    cli.add_argument("--end", default=date.today().isoformat(), type=parse_iso)
    cli.add_argument("--day-sheets-folder-id",
                     help="Optional exact Graph folder ID, instead of auto-discovering Day Sheets")
    cli.add_argument("--stage", action="store_true",
                     help="Staging-only Supabase import, with no automatic verification")
    cli.add_argument("--checkpoint", type=Path,
                     help="Local private resume state; updated after entire successful date windows")
    cli.add_argument("--report", type=Path,
                     help="Local private JSONL report with site/date/count/status; never store in GitHub")
    cli.add_argument("--max-windows", type=int, default=0,
                     help="Limit windows this run (0 means all)")
    args = cli.parse_args()
    if args.end < args.start:
        cli.error("--end must not precede --start")
    if args.stage and (not os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or
                       not os.environ.get("SUPABASE_URL", "").startswith("https://")):
        cli.error("For --stage set secure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    graph = Graph(os.environ.get("GRAPH_ACCESS_TOKEN", ""),
                  os.environ.get("GRAPH_MAILBOX", "me"))
    days_folder = args.day_sheets_folder_id or graph.find_day_sheets_folder()
    sources = [("day_sheets", days_folder), ("inbox", "inbox")]
    completed = load_checkpoint(args.checkpoint)
    counts = Counter()
    processed_windows = 0

    for start, end in windows(args.start, args.end):
        key = start + "/" + end
        if key in completed:
            continue
        errors = []
        results = []
        seen = set()
        for folder_kind, folder_id in sources:
            for message in graph.messages(start, end, folder_id):
                site = resolve_site(message)
                if not site or not source_matches(site, folder_kind) or not message.get("hasAttachments") or not message.get("id"):
                    continue
                msg_id = message["id"]
                try:
                    for att in graph.attachments(msg_id):
                        filename = str(att.get("name") or "")
                        if not filename.lower().endswith(".pdf") or att.get("isInline"):
                            continue
                        if int(att.get("size") or 0) > MAX_PDF_SIZE:
                            errors.append([site, "attachment exceeds size limit"])
                            continue
                        attachment_id = att.get("id")
                        if not attachment_id:
                            continue
                        blob = graph.download(msg_id, attachment_id)
                        if not blob.startswith(b"%PDF"):
                            errors.append([site, "invalid PDF attachment"])
                            continue
                        with tempfile.TemporaryDirectory(prefix="shiftboard-jobs-") as temp:
                            report_path = Path(temp) / "report.pdf"
                            report_path.write_bytes(blob)
                            try:
                                rec = parse(report_path, site)
                            except ValueError as exc:
                                # Non-Profit-Tracker PDFs (e.g. payment sheets) are expected.
                                if "not a Profit Tracker report" in str(exc):
                                    continue
                                errors.append([site, "PDF rejected: " + str(exc).split(":")[-1]])
                                continue
                            # Forwarded or re-sent identical PDFs should not become repeat reports.
                            dedupe = (site, rec["report_date"], rec["source_sha256"])
                            if dedupe in seen:
                                continue
                            seen.add(dedupe)
                            if not rec["sales_reconciled"] or rec["unknown_categories"]:
                                errors.append([site, "unreconciled source or unknown category"])
                                continue
                            if args.stage:
                                command = [sys.executable, str(Path(__file__).with_name("stage_import.py")),
                                           str(report_path), "--site", site, "--stage",
                                           "--source-filename", filename, "--message-id", msg_id,
                                           "--attachment-id", attachment_id]
                                if message.get("receivedDateTime"):
                                    command += ["--received-at", message["receivedDateTime"]]
                                run = subprocess.run(command, text=True, capture_output=True)
                                if run.returncode:
                                    errors.append([site, "staging failed: " + run.stderr[-200:]])
                                    continue
                            results.append({"site_key": site, "report_date": rec["report_date"],
                                            "total_jobs": rec["total_jobs"],
                                            "service_repair_candidates": rec["service_repair_confirmed"],
                                            "review_jobs": rec["service_repair_to_review"],
                                            "sales_reconciled": True,
                                            "status": "staged" if args.stage else "dry_run"})
                            counts[site] += 1
                except Exception as exc:
                    errors.append([site, "attachment read failed: " + str(exc)[:160]])
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            with args.report.open("a", encoding="utf-8") as out:
                for rec in results:
                    out.write(json.dumps(rec) + "\n")
        print(json.dumps({"received_window": key, "reports": len(results),
                          "errors": errors, "status": "completed" if not errors else "retry_required"}))
        if errors:
            # Do not advance checkpoint beyond reports with ambiguous parsing/staging.
            raise SystemExit("Window " + key + " incomplete; correct errors then retry.")
        completed.add(key)
        save_checkpoint(args.checkpoint, completed)
        processed_windows += 1
        if args.max_windows > 0 and processed_windows >= args.max_windows:
            break
    print("Completed site/report counts this run: " + json.dumps(dict(sorted(counts.items()))))


if __name__ == "__main__":
    main()
