"""Synthetic tests: no actual workshop or customer records."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
import fitz

SOURCE = Path(__file__).resolve().parents[1] / "import_profit_tracker.py"
spec = importlib.util.spec_from_file_location("profit_parser", SOURCE)
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


def fixture(path, date_range="13/10/2026 13/10/2026"):
    rows = [
        ("I0001", "J0001", "Labour", "100.00"),
        ("I0002", "J0001", "Fixed Price", "50.00"),
        ("C0003", "J0001", "Discount", "-10.00"),
        ("I0004", "J0002", "Fixed Price", "60.00"),
        ("I0005", "J0003", "MOT", "45.00"),
    ]
    lines = ["Profit Tracker", "Date Produced:", "13/10/2026",
             "Date Range:", date_range, "Customer Type:"]
    for invoice, job, category, sell in rows:
        lines.extend([
            "Invoice/Credit Number", invoice, "Job", job, "Date", "13/10/2026",
            "Type", "Cost", "Sell", "Profit", "Margin %",
            "0.00", sell, sell, "100.00%", category,
            "0.00", sell, sell, "100.00%", "Total",
        ])
    lines.extend(["Totals", "Type", "Cost", "Sell", "Profit", "Margin %",
                  "0.00", "245.00", "245.00", "100.00%", "Total"])
    pdf = fitz.open()
    page = pdf.new_page(width=620, height=1600)
    page.insert_text((40, 45), "\n".join(lines), fontsize=7, lineheight=1.15)
    pdf.save(str(path))
    pdf.close()


class JobsParserTests(unittest.TestCase):
    def test_deduplicates_jobs_excludes_credits_and_reconciles(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fixture.pdf"
            fixture(path)
            row = parser.parse(path, "hartlepool")
            self.assertEqual(row["total_jobs"], 3)
            self.assertEqual(row["service_repair_confirmed"], 1)
            self.assertEqual(row["service_repair_to_review"], 1)
            self.assertEqual(row["other_jobs"], 1)
            self.assertEqual(row["credit_notes_excluded"], 1)
            self.assertEqual(len(row["entries"]), 5)
            self.assertTrue(row["sales_reconciled"])
            self.assertEqual(row["calculated_sales_ex_vat"], "245.00")

    def test_rejects_multi_day_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fixture.pdf"
            fixture(path, "12/10/2026 13/10/2026")
            with self.assertRaises(ValueError):
                parser.parse(path, "hartlepool")


if __name__ == "__main__":
    unittest.main()
