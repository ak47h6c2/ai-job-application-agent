import json
import unittest
from unittest import mock
from backend.app.services.ai_tasks import map_fields


class AiMappingTests(unittest.TestCase):
    def test_form_context_is_sent_and_cross_section_suggestions_are_rejected(self):
        fields = [
            {"index": 0, "label": "名称", "section": "awards", "heading": "奖励/荣誉"},
            {"index": 1, "label": "类型", "section": "awards", "heading": "奖励/荣誉"},
            {"index": 2, "label": "名称", "section": "awards", "heading": "奖励/荣誉"},
            {"index": 3, "label": "名称", "section": "unknown"},
            {"index": 4, "label": "详细描述"},
        ]
        result = [{"index": 0, "key": "projects.name"}, {"index": 1, "key": "work.type"},
                  {"index": 2, "key": "awards.name"}, {"index": 3, "key": "awards.name"},
                  {"index": 4, "key": "projects.description"}, {"index": 999, "key": "projects.name"},
                  {"index": 2, "key": "projects.name"}]
        with mock.patch("backend.app.services.ai_tasks.chat_json", return_value=result) as chat:
            mappings = map_fields(fields, "zh")
        self.assertEqual(mappings, [{"index": 0, "key": None}, {"index": 1, "key": None},
                                    {"index": 2, "key": "awards.name"}, {"index": 3, "key": None},
                                    {"index": 4, "key": None}])
        self.assertEqual(json.loads(chat.call_args.args[1])[0]["heading"], "奖励/荣誉")


    def test_basic_fields_follow_the_extension_boundary_rules(self):
        fields = [
            {"index": 0, "label": "计算机水平", "section": "education"},
            {"index": 1, "label": "联系电话", "section": "family"},
            {"index": 2, "label": "计算机水平", "section": "unknown"},
            {"index": 3, "label": "电子邮箱", "section": "unknown"},
            {"index": 4, "label": "姓名"},
            {"index": 5, "label": "名称", "section": "other"},
        ]
        result = [{"index": 0, "key": "basic.computerLevel"}, {"index": 1, "key": "basic.phone"},
                  {"index": 2, "key": "basic.computerLevel"}, {"index": 3, "key": "basic.email"},
                  {"index": 4, "key": "basic.name"}, {"index": 5, "key": "answer"}]
        with mock.patch("backend.app.services.ai_tasks.chat_json", return_value=result):
            mappings = map_fields(fields, "zh")
        self.assertEqual([item["key"] for item in mappings],
                         ["basic.computerLevel", None, "basic.computerLevel", None, "basic.name", None])


    def test_basic_info_borrows_only_the_highest_education_lists_or_named_entries(self):
        fields = [
            {"index": 0, "label": "主要业绩", "section": "basic", "heading": "其他信息"},
            {"index": 1, "label": "资格证书", "section": "basic", "heading": "基础个人信息"},
            {"index": 2, "label": "最高学历", "section": "basic", "heading": "基础个人信息"},
            {"index": 3, "label": "最近工作单位", "section": "basic", "heading": "基础个人信息"},
        ]
        result = [{"index": 0, "key": "work.description"}, {"index": 1, "key": "certificates.name"},
                  {"index": 2, "key": "education.degree"}, {"index": 3, "key": "work.company"}]
        with mock.patch("backend.app.services.ai_tasks.chat_json", return_value=result):
            mappings = map_fields(fields, "zh")
        self.assertEqual([item["key"] for item in mappings], [None, "certificates.name", "education.degree", "work.company"])


if __name__ == "__main__":
    unittest.main()
