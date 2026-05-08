import unittest

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
        )

        self.assertEqual(len(result.scanned_messages), 2)
        self.assertEqual(len(result.job_messages), 1)
        self.assertEqual(len(result.leads), 1)
        self.assertEqual(result.leads[0].title, "Software Engineer Intern")


if __name__ == "__main__":
    unittest.main()
