"""Synthetic and offline tests for week-by-week Outlook discovery."""
import importlib.util
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("jobs_graph_backfill", HERE / "backfill_outlook_graph.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class OutlookBackfillTests(unittest.TestCase):
    def test_week_boundaries_are_inclusive_of_last_day(self):
        actual = list(mod.windows(date(2024, 10, 12), date(2024, 10, 20)))
        self.assertEqual(actual, [("2024-10-12", "2024-10-19"), ("2024-10-19", "2024-10-21")])

    def test_one_day_range(self):
        self.assertEqual(list(mod.windows(date(2024, 10, 12), date(2024, 10, 12))),
                         [("2024-10-12", "2024-10-13")])

    def test_case_insensitive_sender_allowlist(self):
        self.assertEqual(mod.resolve_site({"from":{"emailAddress":
                         {"address":"SEAHAM@NEAUTOSERVICES.COM"}}}), "seaham")
        self.assertIsNone(mod.resolve_site({"from":{"emailAddress":
                         {"address":"someone@other.invalid"}}}))

    def test_mail_sources_are_partitioned(self):
        self.assertTrue(mod.source_matches("lido", "inbox"))
        self.assertFalse(mod.source_matches("lido", "day_sheets"))
        self.assertTrue(mod.source_matches("middlesbrough", "day_sheets"))
        self.assertFalse(mod.source_matches("middlesbrough", "inbox"))
        self.assertFalse(mod.source_matches(None, "day_sheets"))

    def test_day_sheets_discovery_ignores_trailing_spaces(self):
        graph = mod.Graph("synthetic-token", "me")
        def fake_pages(url):
            self.assertIn("/mailFolders?", url)
            yield {"id": "test-folder", "displayName": "day sheets ", "childFolderCount": 0}
        graph.pages = fake_pages
        self.assertEqual(graph.find_day_sheets_folder(), "test-folder")

    def test_message_collection_uses_requested_folder(self):
        graph = mod.Graph("synthetic-token", "me")
        collected = []
        def fake_pages(url):
            collected.append(url)
            yield {"id": "test-message"}
        graph.pages = fake_pages
        self.assertEqual(list(graph.messages("2024-10-12", "2024-10-19", "inbox")),
                         [{"id": "test-message"}])
        self.assertIn("/mailFolders/inbox/messages?", collected[0])

    def test_non_graph_paging_links_blocked(self):
        graph = mod.Graph("synthetic-token", "me")
        with self.assertRaises(ValueError):
            graph.get("https://untrusted.invalid/grab-token")

    def test_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "check.json"
            self.assertEqual(mod.load_checkpoint(p), set())
            mod.save_checkpoint(p, {"2024-10-12/2024-10-19"})
            self.assertEqual(mod.load_checkpoint(p), {"2024-10-12/2024-10-19"})


if __name__ == "__main__":
    unittest.main()
