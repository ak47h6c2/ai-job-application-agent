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

    def test_parse_job_email_extracts_linkedin_chinese_company_hiring_insights(self) -> None:
        text = """
        软件工程实习生: Atlassian和亚马逊在您附近招聘了职位
        过去一周的软件工程实习生职位趋势
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
        寻找与您相似的会员的公司
        谷歌
        软件开发
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 2)
        self.assertEqual(leads[0].title, "Software Engineering Intern")
        self.assertEqual(leads[0].company, "Atlassian")
        self.assertEqual(leads[0].location, "Australia")
        self.assertEqual(leads[0].url, "https://www.linkedin.com/comm/company/atlassian/jobs")
        self.assertEqual(leads[1].company, "亚马逊")

    def test_parse_job_email_extracts_linkedin_direct_hiring_subject(self) -> None:
        text = """
        Care GP正在招聘Software Engineering Intern (Founding Team)
        查看职位
        https://www.linkedin.com/jobs/view/123/?trackingId=abc
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0].company, "Care GP")
        self.assertEqual(leads[0].title, "Software Engineering Intern (Founding Team)")
        self.assertEqual(leads[0].location, "Location not stated")

    def test_parse_job_email_extracts_seek_grad_role_details(self) -> None:
        text = """
        Subject: Google invites you to join their Software Engineering Internship!
        Hi Cheng,
        Google is looking for curious, driven students to join our Software Engineering Internship program in Sydney.
        The Details
        Role: Software Engineering Internship, Summer 2026/27
        Who: Students in a BS, MS, or PhD program.
        Where: Our Google Sydney HQ.
        Application Deadline: May 8, 2026.
        Apply Now
        Good Luck!
        The SEEK Grad Team
        Visit https://au.gradconnection.com/unsubscribe/example to unsubscribe from the mailing list
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0].company, "Google")
        self.assertEqual(leads[0].title, "Software Engineering Internship, Summer 2026/27")
        self.assertEqual(leads[0].location, "Sydney, NSW")
        self.assertEqual(leads[0].url, "")

    def test_parse_job_email_extracts_seek_grad_multiple_internship_titles(self) -> None:
        text = """
        Subject: Last chance! You’ve been selected to apply for Optiver’s internship roles
        Applications close soon for Optiver's 2026/27 Summer Internships.
        Apply now
        Quantitative Trading Internship
        Quantitative Researcher Internship
        Software Developer Internship
        Good Luck!
        The SEEK Grad Team
        """

        leads = parse_job_email(text, source="sample")

        self.assertEqual([lead.title for lead in leads], [
            "Quantitative Trading Internship",
            "Quantitative Researcher Internship",
            "Software Developer Internship",
        ])
        self.assertTrue(all(lead.company == "Optiver" for lead in leads))


if __name__ == "__main__":
    unittest.main()
