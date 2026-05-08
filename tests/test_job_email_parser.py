import unittest

from backend.app.parsers.job_email_parser import parse_job_email


class JobEmailParserTests(unittest.TestCase):
    def test_parse_job_email_extracts_linkedin_style_jobs(self) -> None:
        text = """
        Software Engineer Intern
        Catalyst Funds Management
        Sydney
        High skill match
        View job: https://example.com/job
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0].title, "Software Engineer Intern")
        self.assertEqual(leads[0].company, "Catalyst Funds Management")
        self.assertEqual(leads[0].location, "Sydney")
        self.assertEqual(leads[0].url, "https://example.com/job")
        self.assertIn("high skill match", leads[0].signals)

    def test_parse_job_email_cleans_tracking_query_from_url(self) -> None:
        text = """
        Software Engineer Intern
        Catalyst Funds Management
        Sydney
        View job: https://www.linkedin.com/jobs/view/123/?trackingId=abc
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(leads[0].url, "https://www.linkedin.com/jobs/view/123/")

    def test_parse_job_email_ignores_non_job_lines(self) -> None:
        text = """
        Recommended for you
        See all jobs

        Junior Developer
        Children's Cancer Institute
        Sydney, NSW
        View job: https://example.com/junior
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0].title, "Junior Developer")

    def test_parse_job_email_does_not_bleed_signals_between_jobs(self) -> None:
        text = """
        Junior Developer
        Children's Cancer Institute
        Sydney, NSW
        View job: https://example.com/junior

        Embedded Software Engineer
        Change Recruitment
        Melbourne, VIC
        Actively hiring
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 2)
        self.assertEqual(leads[0].signals, ())
        self.assertIn("actively hiring", leads[1].signals)


if __name__ == "__main__":
    unittest.main()
