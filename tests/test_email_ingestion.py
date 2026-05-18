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


class SubjectOnlyQQMailClient:
    def list_messages(self, *, folder: str, since: str, limit: int, candidate_limit: int):
        return [
            {
                "uid": "8427",
                "subject": "软件工程实习生: Atlassian和亚马逊在您附近招聘了职位",
                "from": "领英 <messages-noreply@linkedin.com>",
                "date": "Fri, 08 May 2026 10:00:00 +0000",
                "seen": False,
            },
        ]

    def read_message(self, *, uid: str, folder: str, max_chars: int):
        return {
            "text": """
            过去一周的软件工程实习生职位趋势
            18
            本周在澳洲招聘的软件工程实习生职位
            招聘您的职位的公司
            Atlassian
            1 新入职员工
            查看职位
            https://www.linkedin.com/comm/company/atlassian/jobs?trackingId=abc
            亚马逊
            1 新入职员工
            查看职位
            https://www.linkedin.com/comm/company/amazon/jobs?trackingId=abc
            """,
        }


class TargetedSearchQQMailClient:
    def list_messages(self, *, folder: str, since: str, limit: int, candidate_limit: int):
        return [
            {
                "uid": "9000",
                "subject": "Receipt from a shop",
                "from": "Shop <promo@example.com>",
                "date": "Thu, 23 Apr 2026 02:00:00 +0000",
                "seen": False,
            }
        ]

    def search_messages(
        self,
        *,
        folder: str,
        since: str,
        limit: int,
        candidate_limit: int,
        from_contains: str = "",
        subject_contains: str = "",
    ):
        if from_contains == "gradconnection":
            return [
                {
                    "uid": "7215",
                    "subject": "Google invites you to join their Software Engineering Internship!",
                    "from": "SEEK Grad <mail@gradconnection.com>",
                    "date": "Thu, 23 Apr 2026 01:20:51 +0000",
                    "seen": False,
                }
            ]
        return []

    def read_message(self, *, uid: str, folder: str, max_chars: int):
        if uid == "7215":
            return {
                "text": """
                Hi Cheng,
                Google is looking for curious students to join our Software Engineering Internship program in Sydney.
                The Details
                Role: Software Engineering Internship, Summer 2026/27
                Where: Our Google Sydney HQ.
                Apply Now
                Good Luck!
                The SEEK Grad Team
                Visit https://au.gradconnection.com/unsubscribe/example to unsubscribe from the mailing list
                """,
            }
        return {"text": ""}


class UnparsedJobMailClient:
    def list_messages(self, *, folder: str, since: str, limit: int, candidate_limit: int):
        return [
            {
                "uid": "3100",
                "subject": "New jobs matching your search",
                "from": "UNSWConnect <careers@unsw.edu.au>",
                "date": "Fri, 08 May 2026 10:00:00 +0000",
                "seen": False,
            },
        ]

    def read_message(self, *, uid: str, folder: str, max_chars: int):
        return {"text": "Open the portal to view roles. No job title, company, or location is included here."}


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

    def test_is_job_related_message_ignores_linkedin_social_and_international_noise(self) -> None:
        self.assertFalse(
            is_job_related_message(
                {
                    "subject": "您有 1 条新消息",
                    "from": "领英 <notifications-noreply@linkedin.com>",
                }
            )
        )
        self.assertFalse(
            is_job_related_message(
                {
                    "subject": "Introducing LIVE in Australia, a community for international students",
                    "from": "Vic <victor@example.org>",
                }
            )
        )
        self.assertTrue(
            is_job_related_message(
                {
                    "subject": "软件工程实习生: Atlassian和亚马逊在您附近招聘了职位",
                    "from": "领英 <messages-noreply@linkedin.com>",
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

    def test_scan_qq_mail_for_jobs_uses_subject_when_parsing_job_alerts(self) -> None:
        result = scan_qq_mail_for_jobs(
            since="2026-05-08",
            client=SubjectOnlyQQMailClient(),
            auto_read_job_pages=False,
        )

        self.assertEqual(len(result.job_messages), 1)
        self.assertEqual(len(result.leads), 2)
        self.assertEqual(result.leads[0].title, "Software Engineering Intern")
        self.assertEqual(result.leads[0].company, "Atlassian")
        self.assertEqual(result.leads[0].location, "Australia")

    def test_scan_qq_mail_for_jobs_includes_targeted_platform_search_results(self) -> None:
        result = scan_qq_mail_for_jobs(
            since="2026-04-18",
            client=TargetedSearchQQMailClient(),
            auto_read_job_pages=False,
        )

        self.assertEqual(len(result.scanned_messages), 2)
        self.assertEqual(len(result.job_messages), 1)
        self.assertEqual(result.leads[0].company, "Google")
        self.assertEqual(result.leads[0].title, "Software Engineering Internship, Summer 2026/27")
        self.assertEqual(result.scan_metadata["scanned_count"], 2)
        self.assertEqual(result.scan_metadata["diagnostic_version"], 2)
        self.assertEqual(result.scan_metadata["job_message_count"], 1)
        self.assertEqual(result.scan_metadata["lead_count"], 1)
        self.assertIn("gradconnection", result.scan_metadata["backfill_sources"])
        grad_source = next(
            source
            for source in result.scan_metadata["source_counts"]
            if source["name"] == "SEEK Grad / GradConnection"
        )
        self.assertEqual(grad_source["scanned"], 1)
        self.assertEqual(grad_source["job_messages"], 1)
        self.assertEqual(grad_source["leads"], 1)
        self.assertEqual(grad_source["status"], "parsed")

    def test_scan_metadata_flags_job_mail_without_parsed_leads(self) -> None:
        result = scan_qq_mail_for_jobs(
            since="2026-05-08",
            client=UnparsedJobMailClient(),
            auto_read_job_pages=False,
        )

        self.assertEqual(len(result.job_messages), 1)
        self.assertEqual(len(result.leads), 0)
        unsw_source = result.scan_metadata["source_counts"][0]
        self.assertEqual(unsw_source["name"], "UNSW / CSA")
        self.assertEqual(unsw_source["status"], "needs_review")
        self.assertEqual(unsw_source["sample_subjects"], ["New jobs matching your search"])
        self.assertEqual(
            result.scan_metadata["attention_items"],
            [{"name": "UNSW / CSA", "reason": "job_mail_without_leads", "job_messages": 1, "scanned": 1}],
        )

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
