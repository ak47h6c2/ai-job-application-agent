import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"JOB_AGENT_DATA_DIR": self.tmp.name})
        self.env.start()
        from backend.app.api import app

        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.env.stop()
        self.tmp.cleanup()

    def test_profile_round_trip_cleans_values(self) -> None:
        empty = self.client.get("/api/profile").json()["profile"]
        self.assertEqual(empty["sections"]["education"], [])

        profile = {
            "basic": {"name": {"zh": "张三", "en": "San Zhang"}, "email": "a@b.com", "gender": "male", "blank": ""},
            "sections": {"education": [{"school": {"zh": "清华大学"}, "degree": "bachelor"}, "not-an-entry"], "unknown": [{}]},
            "answers": [{"question": "期望薪资", "answer": "面议"}],
        }
        saved = self.client.put("/api/profile", json={"profile": profile}).json()["profile"]

        self.assertEqual(saved["basic"]["name"], {"zh": "张三", "en": "San Zhang"})
        self.assertNotIn("blank", saved["basic"])
        self.assertEqual(len(saved["sections"]["education"]), 1)
        self.assertNotIn("unknown", saved["sections"])
        self.assertEqual(saved["answers"][0]["source"], "manual")
        self.assertEqual(self.client.get("/api/profile").json()["profile"]["basic"]["email"], "a@b.com")

    def test_questions_without_answers_are_kept(self) -> None:
        saved = self.client.put(
            "/api/profile", json={"profile": {"answers": [{"question": "你为什么选择我们公司？", "answer": ""}, {"question": "", "answer": "orphan"}]}}
        ).json()["profile"]
        self.assertEqual([answer["question"] for answer in saved["answers"]], ["你为什么选择我们公司？"])
        self.assertEqual(saved["answers"][0]["answer"], "")

    def test_learned_answers_merge_by_question(self) -> None:
        self.client.put("/api/profile", json={"profile": {"answers": [{"question": "期望薪资：", "answer": "面议", "source": "manual"}]}})
        answers = self.client.post(
            "/api/profile/answers",
            json={"answers": [{"question": "期望薪资", "answer": "15k", "source": "learned"}, {"question": "到岗时间", "answer": "一周内", "source": "learned"}]},
        ).json()["answers"]

        self.assertEqual(len(answers), 2)
        salary = next(answer for answer in answers if answer["question"] == "期望薪资")
        self.assertEqual(salary["answer"], "15k")
        self.assertEqual(salary["source"], "manual")

    def test_attachment_upload_download_delete(self) -> None:
        uploaded = self.client.post(
            "/api/attachments",
            files={"file": ("我的简历.pdf", b"%PDF-1.4 test", "application/pdf")},
            data={"kind": "resume_zh"},
        ).json()["attachment"]
        self.assertEqual(uploaded["kind"], "resume_zh")
        self.assertNotIn("file", uploaded)

        listed = self.client.get("/api/attachments").json()["attachments"]
        self.assertEqual([item["id"] for item in listed], [uploaded["id"]])
        download = self.client.get(f"/api/attachments/{uploaded['id']}/file")
        self.assertEqual(download.content, b"%PDF-1.4 test")

        self.assertTrue(self.client.delete(f"/api/attachments/{uploaded['id']}").json()["deleted"])
        self.assertEqual(self.client.get("/api/attachments").json()["attachments"], [])

    def test_attachment_rejects_unknown_kind_and_type(self) -> None:
        bad_kind = self.client.post("/api/attachments", files={"file": ("a.pdf", b"x", "application/pdf")}, data={"kind": "nope"})
        bad_type = self.client.post("/api/attachments", files={"file": ("a.exe", b"x", "application/octet-stream")}, data={"kind": "other"})
        self.assertEqual(bad_kind.status_code, 400)
        self.assertEqual(bad_type.status_code, 400)

    def test_resume_parse_with_rules_merges_without_overwriting(self) -> None:
        self.client.put("/api/profile", json={"profile": {"basic": {"email": "keep@me.com"}}})
        text = "张三\n电话：138 0013 8000  邮箱：new@x.com\n性别：男  政治面貌：共青团员\n教育经历\n2019.09 - 2023.06  北京大学  计算机科学与技术  本科\n"
        result = self.client.post(
            "/api/resume/parse", files={"file": ("cv.txt", text.encode("utf-8"), "text/plain")}, data={"use_ai": "true"}
        ).json()

        self.assertEqual(result["method"], "rules")
        basic = result["profile"]["basic"]
        self.assertEqual(basic["email"], "keep@me.com")
        self.assertEqual(basic["name"], {"zh": "张三"})
        self.assertEqual(basic["phone"], {"zh": "13800138000"})
        self.assertEqual(basic["gender"], "male")
        self.assertEqual(basic["politicalStatus"], "league_member")
        education = result["profile"]["sections"]["education"][0]
        self.assertEqual(education["school"], {"zh": "北京大学"})
        self.assertEqual(education["degree"], "bachelor")
        self.assertEqual(education["startDate"], "2019-09")
        self.assertEqual(education["endDate"], "2023-06")

    def test_ai_settings_hide_key_and_require_configuration(self) -> None:
        self.assertFalse(self.client.get("/api/settings").json()["ai"]["configured"])
        self.assertEqual(self.client.post("/api/ai/answer", json={"question": "Why us?"}).status_code, 412)

        saved = self.client.put(
            "/api/settings", json={"provider": "openai", "base_url": "https://api.deepseek.com", "model": "deepseek-chat", "api_key": "sk-1234567890"}
        ).json()["ai"]
        self.assertTrue(saved["configured"])
        self.assertEqual(saved["key_hint"], "…7890")
        self.assertNotIn("api_key", saved)

        kept = self.client.put("/api/settings", json={"provider": "openai", "base_url": "https://api.deepseek.com", "model": "deepseek-chat"}).json()["ai"]
        self.assertTrue(kept["has_key"])

    def test_ai_answer_uses_profile_and_job(self) -> None:
        self.client.put("/api/profile", json={"profile": {"basic": {"name": {"zh": "张三"}, "idNumber": "110101200001011234"}}})
        self.client.put("/api/settings", json={"provider": "openai", "base_url": "https://x", "model": "m", "api_key": "sk-abcdefgh"})
        with mock.patch("backend.app.services.ai_tasks.chat", return_value="我很适合") as chat:
            reply = self.client.post(
                "/api/ai/answer", json={"question": "为什么选择我们", "lang": "zh", "job": {"company": "示例公司", "title": "后端开发"}}
            ).json()
        self.assertEqual(reply["answer"], "我很适合")
        prompt = chat.call_args.args[1]
        self.assertIn("示例公司", prompt)
        self.assertIn("张三", prompt)
        self.assertNotIn("110101200001011234", prompt)

    def test_ai_translate_fills_missing_language(self) -> None:
        self.client.put("/api/settings", json={"provider": "openai", "base_url": "https://x", "model": "m", "api_key": "sk-abcdefgh"})
        profile = {"basic": {"name": {"zh": "张三"}}, "sections": {"education": [{"school": {"zh": "北京大学"}, "startDate": "2019-09"}]}}
        reply = {"basic.name": "San Zhang", "sections.education.0.school": "Peking University", "basic.bogus": "x"}
        with mock.patch("backend.app.services.ai_tasks.chat_json", return_value=reply):
            result = self.client.post("/api/ai/translate", json={"target": "en", "profile": profile}).json()
        self.assertEqual(result["translated"], 2)
        self.assertEqual(result["profile"]["basic"]["name"], {"zh": "张三", "en": "San Zhang"})
        self.assertEqual(result["profile"]["sections"]["education"][0]["school"]["en"], "Peking University")

    def test_ai_map_fields_keeps_only_known_keys(self) -> None:
        self.client.put("/api/settings", json={"provider": "openai", "base_url": "https://x", "model": "m", "api_key": "sk-abcdefgh"})
        reply = [{"index": 0, "key": "basic.phone"}, {"index": 1, "key": "education.school"}, {"index": 2, "key": "basic.madeUp"}, {"index": 3, "key": "answer"}]
        with mock.patch("backend.app.services.ai_tasks.chat_json", return_value=reply):
            result = self.client.post(
                "/api/ai/map-fields", json={"fields": [{"index": i, "label": f"field {i}"} for i in range(4)], "lang": "zh"}
            ).json()
        self.assertEqual([item["key"] for item in result["mappings"]], ["basic.phone", "education.school", None, "answer"])

    def test_application_records_from_extension(self) -> None:
        record = self.client.post(
            "/api/applications", json={"title": "后端开发", "company": "示例", "url": "https://jobs.example.com/1", "source": "extension"}
        ).json()["record"]
        self.assertEqual(record["status"], "applied")
        updated = self.client.post("/api/applications", json={"key": record["key"], "title": "后端开发", "company": "示例", "status": "interview"}).json()["record"]
        self.assertEqual(updated["source"], "extension")
        self.assertEqual(len(self.client.get("/api/applications").json()["records"]), 1)

    def test_schema_endpoint(self) -> None:
        schema = self.client.get("/api/schema").json()
        self.assertIn("education", [section["key"] for section in schema["sections"]])


if __name__ == "__main__":
    unittest.main()
