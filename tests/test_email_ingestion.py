import unittest

from backend.app.services.job_url_reader import JobUrlPreview
from backend.app.services.email_ingestion import is_job_related_message, scan_qq_mail_for_jobs


class FakeQQMailClient:
    def list_messages(self, *, folder: str, since: str, limit: int, candidate_limit: int):
        return [
            {
                "uid": "1",
                "subject": "Software Engineer Intern roles near you",
                "from": "LinkedIn <jobs@example.com>",
                "date": "Fri, 08 May 2026 10:00:00 +0000",
                "seen": False,
            },
            {
                "uid": "2",
                "subject": "Grocery specials",
                "from": "Shop <promo@example.com>",
                "date": "Fri, 08 May 2026 09:00:00 +0000",
                "seen": False,
            },
        ]

    def read_message(self, *, uid: str, folder: str, max_chars: int):
        return {
            "text": """
            Software Engineer Intern
            Catalyst Funds Management
            Sydney
            High skill match
            View job: https://example.com/job

            Software Engineer Intern
            Catalyst Funds Management
            Sydney
            High skill match
            View job: https://example.com/job?duplicate=true
            """
        }


class EmailIngestionTests(unittest.TestCase):
    def test_is_job_related_message_matches_subject_and_sender(self) -> None:
        self.assertTrue(
            is_job_related_message(
                {
                    "subject": "New developer jobs",
                    "from": "LinkedIn <jobs@example.com>",
                }
            )
        )
        self.assertFalse(
            is_job_related_message(
                {
                    "subject": "Weekend sale",
                    "from": "Retailer <promo@example.com>",
                }
            )
        )

    def test_scan_qq_mail_for_jobs_reads_only_job_related_messages(self) -> None:
        result = scan_qq_mail_for_jobs(
            since="2026-05-08",
            client=FakeQQMailClient(),
            auto_read_job_pages=False,
        )

        self.assertEqual(len(result.scanned_messages), 2)
        self.assertEqual(len(result.job_messages), 1)
        self.assertEqual(len(result.leads), 1)
        self.assertEqual(result.leads[0].title, "Software Engineer Intern")

    def test_scan_qq_mail_auto_reads_job_links(self) -> None:
        def fake_reader(url: str) -> JobUrlPreview:
            return JobUrlPreview(
                title="Software Engineer Intern",
                company="Catalyst Funds Management",
                location="Sydney, NSW",
                description=(
                    "Job description Responsibilities include Python automation, SQL data work, "
                    "testing, collaboration, and maintaining internal engineering tools."
                ),
                url=url,
                extraction_source="schema_org_jobposting",
                quality_score=10,
                quality_label="strong",
            )

        result = scan_qq_mail_for_jobs(
            since="2026-05-08",
            client=FakeQQMailClient(),
            auto_read_job_pages=True,
            auto_read_limit=1,
            job_page_reader=fake_reader,
        )

        self.assertEqual(result.job_page_read_attempts, 1)
        self.assertEqual(result.job_page_read_successes, 1)
        self.assertEqual(result.job_page_read_failures, 0)
        self.assertIn("Python automation", result.leads[0].raw_excerpt)
        self.assertIn("auto-read full job description", result.leads[0].signals)

    def test_scan_qq_mail_marks_blocked_job_links(self) -> None:
        def blocked_reader(url: str) -> JobUrlPreview:
            raise RuntimeError("login required")

        result = scan_qq_mail_for_jobs(
            since="2026-05-08",
            client=FakeQQMailClient(),
            auto_read_job_pages=True,
            auto_read_limit=1,
            job_page_reader=blocked_reader,
        )

        self.assertEqual(result.job_page_read_attempts, 1)
        self.assertEqual(result.job_page_read_successes, 0)
        self.assertEqual(result.job_page_read_failures, 1)
        self.assertIn("needs logged-in page read", result.leads[0].signals)


if __name__ == "__main__":
    unittest.main()
