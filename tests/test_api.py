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

    def test_writes_from_other_websites_are_refused(self) -> None:
        files = {"file": ("resume.pdf", b"%PDF-1.4 test", "application/pdf")}
        blocked = self.client.post("/api/attachments", files=files, data={"kind": "resume_zh"}, headers={"Origin": "https://evil.example"})
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(self.client.get("/api/attachments").json()["attachments"], [])
        for origin in ("http://127.0.0.1:5173", "chrome-extension://abcdefghijklmnop"):
            allowed = self.client.post("/api/attachments", files=files, data={"kind": "resume_zh"}, headers={"Origin": origin})
            self.assertEqual(allowed.status_code, 200, origin)
        # Reads and non-browser clients (no Origin) are unaffected.
        self.assertEqual(self.client.get("/api/profile", headers={"Origin": "https://evil.example"}).status_code, 200)
        self.assertEqual(self.client.put("/api/profile", json={"profile": {}}).status_code, 200)

    def test_answer_drafts_are_cut_at_a_sentence_end(self) -> None:
        from backend.app.services import ai_tasks

        reply = "我在实习中负责硬件测试。熟悉嵌入式开发和电路调试，能够独立完成模块验证。希望在银行科技岗位继续成长"
        with mock.patch.object(ai_tasks, "chat", return_value=reply) as chat:
            answer = ai_tasks.answer_question({}, question="自我介绍", lang="zh", max_length=40, min_length=20)
        self.assertEqual(answer, "我在实习中负责硬件测试。熟悉嵌入式开发和电路调试，能够独立完成模块验证。")
        self.assertIn("between 20 and 40 characters", chat.call_args.args[0])

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

    def test_stale_editor_cannot_overwrite_an_extension_capture(self) -> None:
        loaded = self.client.put("/api/profile", json={"profile": {"basic": {"name": {"zh": "测试用户"}}}}).json()["profile"]
        self.client.post("/api/profile/capture", json={"basic": [{"key": "email", "value": "captured@example.com"}]})
        loaded["basic"]["name"] = {"zh": "编辑中的名字"}
        response = self.client.put("/api/profile", json={"profile": loaded, "expectedUpdatedAt": loaded["updatedAt"]})
        self.assertEqual(response.status_code, 409)
        current = self.client.get("/api/profile").json()["profile"]
        self.assertEqual(current["basic"], {"name": {"zh": "测试用户"}, "email": "captured@example.com"})
        current["basic"]["name"] = {"zh": "编辑中的名字"}
        accepted = self.client.put("/api/profile", json={"profile": current, "expectedUpdatedAt": current["updatedAt"]})
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["profile"]["basic"]["email"], "captured@example.com")

    def test_empty_profile_revision_is_checked_on_first_save(self) -> None:
        self.client.post("/api/profile/capture", json={"basic": [{"key": "email", "value": "captured@example.com"}]})
        stale = self.client.put("/api/profile", json={"profile": {"basic": {}}, "expectedUpdatedAt": None})
        self.assertEqual(stale.status_code, 409)

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

    def test_capture_fills_profile_and_adds_entries(self) -> None:
        profile = {
            "basic": {"name": {"zh": "李明"}, "phone": {"zh": "13800138000"}},
            "sections": {"education": [{"school": {"zh": "北京大学"}, "degree": "master"}]},
        }
        self.client.put("/api/profile", json={"profile": profile})
        response = self.client.post(
            "/api/profile/capture",
            json={
                "basic": [
                    {"key": "studentOrigin", "value": "吉林省/白山市", "lang": "zh"},
                    {"key": "name", "value": "Ming Li", "lang": "en"},
                    {"key": "email", "value": "li@example.com", "lang": "en"},
                    {"key": "age", "value": "24"},
                    {"key": "nope", "value": "x"},
                ],
                "entries": [
                    {"section": "education", "index": 0, "values": [{"key": "major", "value": "计算机科学", "lang": "zh"}]},
                    {"section": "work", "index": None, "values": [{"key": "company", "value": "腾讯", "lang": "zh"}, {"key": "type", "value": "internship"}]},
                    {"section": "education", "index": 9, "values": [{"key": "school", "value": "ignored"}]},
                ],
                "answers": [{"question": "从哪里得知招聘信息", "answer": "学校就业网", "lang": "zh"}],
            },
        )
        self.assertEqual(response.status_code, 200)
        saved = response.json()["profile"]
        self.assertEqual(response.json()["applied"], 7)
        self.assertEqual(saved["basic"]["studentOrigin"], {"zh": "吉林省/白山市"})
        self.assertEqual(saved["basic"]["name"], {"zh": "李明", "en": "Ming Li"})
        self.assertEqual(saved["basic"]["email"], "li@example.com")
        self.assertNotIn("age", saved["basic"], "derived fields are not stored")
        self.assertEqual(saved["sections"]["education"][0]["major"], {"zh": "计算机科学"})
        self.assertEqual(saved["sections"]["education"][0]["degree"], "master")
        self.assertEqual(len(saved["sections"]["education"]), 1)
        self.assertEqual(saved["sections"]["work"], [{"company": {"zh": "腾讯"}, "type": "internship"}])
        self.assertEqual(saved["answers"][0]["answer"], "学校就业网")
        self.assertEqual(saved["answers"][0]["source"], "learned")

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
        self.assertTrue(download.headers["content-disposition"].startswith("attachment;"))
        import base64
        content = self.client.get(f"/api/attachments/{uploaded['id']}/content").json()
        self.assertEqual(base64.b64decode(content["data"]), download.content)
        self.assertEqual(content["size"], len(download.content))
        self.assertEqual(content["name"], "我的简历.pdf")
        self.assertEqual(self.client.get("/api/attachments/not-found/content").status_code, 404)

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

    def test_capture_correspondence_does_not_replace_residence(self) -> None:
        old = {"address": {"zh": "10 Test St"}, "postcode": {"zh": "2000"}, "preferredAddressUse": "mailing"}
        self.client.put("/api/profile", json={"profile": {"basic": old}})
        response = self.client.post("/api/profile/capture", json={"schemaVersion": 2, "basic": [
            {"key": "mailingAddress", "value": "测试路1号", "lang": "zh"},
            {"key": "mailingPostcode", "value": "100000", "lang": "zh"},
            {"key": "examCity", "value": "上海", "lang": "zh"},
        ]})
        self.assertEqual(response.status_code, 200)
        basic = response.json()["profile"]["basic"]
        self.assertEqual(basic["address"], old["address"])
        self.assertEqual(basic["postcode"], old["postcode"])
        self.assertEqual(basic["mailingAddress"], {"zh": "测试路1号"})
        self.assertEqual(basic["mailingPostcode"], "100000")
        self.assertNotIn("expectedCity", basic)

    def test_capture_old_address_suggestions_are_rejected_without_writing(self) -> None:
        old = {"address": {"zh": "10 Test St"}, "postcode": {"zh": "2000"}}
        self.client.put("/api/profile", json={"profile": {"basic": old}})
        response = self.client.post("/api/profile/capture", json={"basic": [{"key": "address", "value": "误识别的地址"}]})
        self.assertEqual(response.status_code, 409)
        self.assertIn("重新读取", response.json()["detail"])
        self.assertEqual(self.client.get("/api/profile").json()["profile"]["basic"], old)

    def test_capture_follows_moved_entries_and_skips_deleted_ones(self) -> None:
        a = {"school": {"zh": "甲大学"}, "startDate": "2019-09"}
        b = {"school": {"zh": "乙大学"}, "startDate": "2023-09"}
        self.client.put("/api/profile", json={"profile": {"sections": {"education": [b, a]}}})
        response = self.client.post("/api/profile/capture", json={"entries": [
            # Read when 甲大学 was entry 0; the Web UI has since moved it to position 1.
            {"section": "education", "index": 0, "values": [{"key": "major", "value": "甲专业"}],
             "identity": [{"key": "school", "value": "甲大学"}, {"key": "startDate", "value": "2019-09"}]},
            {"section": "education", "index": 1, "values": [{"key": "major", "value": "已删除条目的专业"}],
             "identity": [{"key": "school", "value": "丙大学"}]},
        ]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["applied"], response.json()["skipped"]), (1, 1))
        education = response.json()["profile"]["sections"]["education"]
        self.assertEqual(education[0], b)
        self.assertEqual(education[1]["major"], {"zh": "甲专业"})

    def test_unreadable_profile_is_reported_and_never_overwritten(self) -> None:
        path = Path(self.tmp.name) / "profile.json"
        path.write_text('{"basic": {"name": "张三"', encoding="utf-8")
        response = self.client.get("/api/profile")
        self.assertEqual(response.status_code, 503)
        self.assertIn("profile.json", response.json()["detail"])
        capture = self.client.post("/api/profile/capture", json={"basic": [{"key": "email", "value": "a@b.com"}]})
        self.assertEqual(capture.status_code, 503)
        self.assertEqual(self.client.post("/api/profile/answers", json={"answers": [{"question": "Q", "answer": "A"}]}).status_code, 503)
        self.assertEqual(path.read_text(encoding="utf-8"), '{"basic": {"name": "张三"')
        self.assertEqual(self.client.get("/api/health").status_code, 200)

    def test_unreadable_tracker_is_not_replaced_by_a_new_record(self) -> None:
        path = Path(self.tmp.name) / "application_tracker.json"
        path.write_text("not json", encoding="utf-8")
        self.assertEqual(self.client.post("/api/applications", json={"title": "工程师", "company": "测试公司"}).status_code, 503)
        self.assertEqual(path.read_text(encoding="utf-8"), "not json")

    def test_resume_address_purposes_are_independent(self) -> None:
        from backend.app.services.resume_parser import parse_resume_text
        result = parse_resume_text("姓名：测试人\n现居地址：10 Test St\n现居邮编：2000\n通讯地址：测试路1号\n通讯邮编：100000\n家庭地址：家庭路2号\n家庭邮编：200001\n")
        basic = result["basic"]
        self.assertEqual(basic["address"], {"zh": "10 Test St"})
        self.assertEqual(basic["mailingAddress"], {"zh": "测试路1号"})
        self.assertEqual(basic["homeAddress"], {"zh": "家庭路2号"})
        self.assertEqual([basic[key] for key in ("postcode", "mailingPostcode", "homePostcode")], ["2000", "100000", "200001"])


if __name__ == "__main__":
    unittest.main()
