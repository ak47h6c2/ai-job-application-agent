import unittest
from unittest.mock import patch

from backend.app.api import MailPreviewRequest, preview_mail_message


class FakeMailClient:
    def read_message(self, *, uid: str, folder: str, max_chars: int):
        return {
            "uid": uid,
            "folder": folder,
            "subject": "Software Engineer Intern role",
            "from": "Careers <careers@example.com>",
            "date": "Fri, 08 May 2026 10:00:00 +0000",
            "text": """
            Software Engineer Intern
            Example Company
            Sydney, NSW
            High skill match
            View job: https://example.com/jobs/123
            """,
            "text_truncated": False,
        }


class MailPreviewApiTests(unittest.TestCase):
    def test_mail_preview_reads_message_and_returns_detected_job_context(self) -> None:
        with patch("backend.app.api.QQMailMCPClient", return_value=FakeMailClient()):
            payload = preview_mail_message(MailPreviewRequest(folder="INBOX", uid="42", max_chars=4000))

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["uid"], "42")
        self.assertIn("https://example.com/jobs/123", payload["detected_urls"])
        self.assertEqual(payload["parsed_leads"][0]["company"], "Example Company")


if __name__ == "__main__":
    unittest.main()
