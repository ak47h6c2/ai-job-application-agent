import unittest

from backend.app.services.browser_session import BrowserSessionError, validate_browser_job_payload


class BrowserSessionTests(unittest.TestCase):
    def test_rejects_linkedin_login_page(self) -> None:
        payload = {
            "title": "登录领英 | 领英",
            "company": "领英",
            "location": "",
            "url": "https://www.linkedin.com/uas/login?session_redirect=%2Fjobs%2Fview%2F4408845265%2F",
            "description": "登录 电子邮件或手机号 密码 忘记密码？",
            "source": "www.linkedin.com",
            "hasJobPosting": False,
        }

        with self.assertRaises(BrowserSessionError):
            validate_browser_job_payload(payload)

    def test_accepts_real_job_payload(self) -> None:
        payload = {
            "title": "Systems Development Engineer",
            "company": "Amazon Web Services",
            "location": "Sydney, NSW",
            "url": "https://www.linkedin.com/jobs/view/4408845265/",
            "description": "Build and operate distributed systems for cloud infrastructure. Python, Linux, and automation experience preferred.",
            "source": "www.linkedin.com",
            "hasJobPosting": False,
        }

        validated = validate_browser_job_payload(payload)

        self.assertEqual(validated["title"], "Systems Development Engineer")
        self.assertNotIn("hasJobPosting", validated)


if __name__ == "__main__":
    unittest.main()
