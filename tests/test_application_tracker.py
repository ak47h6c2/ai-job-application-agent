import tempfile
import unittest
from pathlib import Path

from backend.app.services.application_tracker import (
    application_key,
    load_application_records,
    upsert_application_record,
)


class ApplicationTrackerTests(unittest.TestCase):
    def test_application_key_prefers_url(self) -> None:
        self.assertEqual(
            application_key(title="Engineer", company="Example", url="HTTPS://Example.com/Job"),
            "url:https://example.com/job",
        )

    def test_upsert_application_record_updates_existing_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            private_dir = Path(tmp_dir)
            first = upsert_application_record(
                private_dir,
                {
                    "title": "Software Engineer",
                    "company": "Example AU",
                    "url": "https://example.com/job",
                    "status": "draft_ready",
                    "note": "Generated package.",
                },
            )
            second = upsert_application_record(
                private_dir,
                {
                    "title": "Software Engineer",
                    "company": "Example AU",
                    "url": "https://example.com/job",
                    "status": "applied",
                    "note": "Submitted on company site.",
                },
            )
            records = load_application_records(private_dir)

            self.assertEqual(first["key"], second["key"])
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["status"], "applied")
            self.assertIn("Submitted", str(records[0]["note"]))

    def test_invalid_status_falls_back_to_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            record = upsert_application_record(
                Path(tmp_dir),
                {
                    "title": "Role",
                    "company": "Company",
                    "status": "unknown",
                },
            )

            self.assertEqual(record["status"], "to_review")

    def test_load_records_accepts_utf8_bom_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            private_dir = Path(tmp_dir)
            path = private_dir / "application_tracker.json"
            path.write_text(
                '{"records":[{"title":"Role","company":"Company","status":"waiting"}]}',
                encoding="utf-8-sig",
            )

            records = load_application_records(private_dir)

            self.assertEqual(records[0]["status"], "waiting")

    def test_load_records_ignores_corrupt_tracker_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            private_dir = Path(tmp_dir)
            (private_dir / "application_tracker.json").write_text("{", encoding="utf-8")

            self.assertEqual(load_application_records(private_dir), [])


if __name__ == "__main__":
    unittest.main()
