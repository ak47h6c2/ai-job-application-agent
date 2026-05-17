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

    def test_cleans_linkedin_full_page_payload(self) -> None:
        payload = {
            "title": "Systems Development Engineer | Amazon Web Services (AWS) | LinkedIn",
            "company": "linkedin.com",
            "location": "",
            "url": "https://www.linkedin.com/jobs/view/4408845265/",
            "description": (
                "Amazon Web Services (AWS) Systems Development Engineer 澳洲 New South Wales 悉尼 · 的时间: 3 天前 关于职位 Description "
                "Amazon is looking for a highly skilled Systems Development Engineer. "
                "Basic Qualifications 4+ years of programming with Python experience. "
                "Company - Amazon Web Services Australia Pty Ltd Job ID: A10412002 "
                "公司简介 Amazon Web Services 订阅相似职位 更多职位 LinkedIn Corporation"
            ),
            "source": "www.linkedin.com",
            "hasJobPosting": False,
        }

        validated = validate_browser_job_payload(payload)

        self.assertEqual(validated["title"], "Systems Development Engineer")
        self.assertEqual(validated["company"], "Amazon Web Services (AWS)")
        self.assertEqual(validated["location"], "New South Wales 悉尼")
        self.assertIn("Basic Qualifications", validated["description"])
        self.assertNotIn("公司简介", validated["description"])
        self.assertNotIn("订阅相似职位", validated["description"])

    def test_rejects_linkedin_shell_before_job_detail_loads(self) -> None:
        payload = {
            "title": "Systems Development Engineer | Amazon Web Services (AWS) | LinkedIn",
            "company": "linkedin.com",
            "location": "",
            "url": "https://www.linkedin.com/jobs/view/4408845265/",
            "description": (
                "Amazon Web Services (AWS) Systems Development Engineer 澳洲 New South Wales 悉尼 "
                "申请 保存 公司简介 Amazon Web Services 订阅相似职位 更多职位 LinkedIn Corporation 选择语言"
            ),
            "source": "www.linkedin.com",
            "hasJobPosting": False,
        }

        with self.assertRaises(BrowserSessionError):
            validate_browser_job_payload(payload)

    def test_rejects_browser_visible_text_that_is_not_a_jd(self) -> None:
        payload = {
            "title": "Systems Development Engineer",
            "company": "Amazon Web Services",
            "location": "Sydney, NSW",
            "url": "https://www.linkedin.com/jobs/view/4408845265/",
            "description": (
                "Systems Development Engineer Amazon Web Services Sydney NSW. "
                "View job Save Apply Share Open app Similar jobs People also viewed. "
                "Company profile Privacy Policy Cookie Policy LinkedIn Corporation."
            ),
            "source": "www.linkedin.com",
            "hasJobPosting": False,
        }

        with self.assertRaises(BrowserSessionError):
            validate_browser_job_payload(payload)

    def test_rejects_current_page_that_does_not_match_expected_job(self) -> None:
        payload = {
            "title": "Video Platform Backend Engineer",
            "company": "Bilibili",
            "location": "Shanghai",
            "url": "https://www.bilibili.com/careers/backend-engineer",
            "description": (
                "Responsibilities include building backend services, maintaining APIs, "
                "supporting Linux systems, and collaborating with engineering teams. "
                "Requirements include Python, databases, automation, and testing experience."
            ),
            "source": "www.bilibili.com",
            "hasJobPosting": False,
        }

        with self.assertRaises(BrowserSessionError):
            validate_browser_job_payload(
                payload,
                expected={
                    "title": "Systems Development Engineer",
                    "company": "Amazon Web Services",
                    "url": "https://www.linkedin.com/jobs/view/4408845265/",
                },
            )

    def test_accepts_redirected_page_when_it_matches_expected_job(self) -> None:
        payload = {
            "title": "Systems Development Engineer",
            "company": "Amazon Web Services",
            "location": "Sydney, NSW",
            "url": "https://amazon.jobs/en/jobs/A10412002/systems-development-engineer",
            "description": (
                "Amazon Web Services is hiring a Systems Development Engineer. "
                "Responsibilities include building distributed systems, maintaining automation, "
                "supporting Linux services, and collaborating with cloud engineering teams. "
                "Basic Qualifications include Python, databases, APIs, and testing experience."
            ),
            "source": "amazon.jobs",
            "hasJobPosting": False,
        }

        validated = validate_browser_job_payload(
            payload,
            expected={
                "title": "Systems Development Engineer",
                "company": "Amazon Web Services",
                "url": "https://www.linkedin.com/jobs/view/4408845265/",
            },
        )

        self.assertEqual(validated["company"], "Amazon Web Services")


if __name__ == "__main__":
    unittest.main()
