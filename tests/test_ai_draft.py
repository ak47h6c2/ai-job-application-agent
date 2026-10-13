import unittest
from unittest import mock

from backend.app.services.ai_client import AIError
from backend.app.services.ai_tasks import answer_question


class AiDraftTests(unittest.TestCase):
    def test_short_skill_prompt_uses_professional_facts_without_private_contacts(self):
        profile = {
            "basic": {"name": {"zh": "测试用户"}, "skills": {"zh": "Python、SQL、系统验证"},
                      "phone": {"zh": "private-phone"}, "email": "private-email",
                      "address": {"zh": "private-address"}, "expectedSalary": "private-salary"},
            "sections": {"work": [{"company": {"zh": "测试企业"}, "description": {"zh": "硬件调试"},
                                    "referencePhone": "private-referee-phone", "referenceName": {"zh": "private-referee"},
                                    "salary": "private-work-salary"}],
                         "family": [{"name": {"zh": "private-family"}}]},
        }
        with mock.patch("backend.app.services.ai_tasks.chat", return_value=" Python、SQL ") as chat:
            answer = answer_question(profile, question="计算机技能", lang="zh", max_length=30)
        self.assertEqual(answer, "Python、SQL")
        system, prompt = chat.call_args.args
        self.assertIn("compact list", system)
        self.assertIn("Python、SQL、系统验证", prompt)
        self.assertIn("硬件调试", prompt)
        self.assertNotIn("private-", prompt)

    def test_blank_model_reply_is_an_error(self):
        with mock.patch("backend.app.services.ai_tasks.chat", return_value=" \n "):
            with self.assertRaisesRegex(AIError, "空内容"):
                answer_question({}, question="其他技能", lang="zh")


if __name__ == "__main__":
    unittest.main()
