import tempfile
import unittest
from pathlib import Path

from backend.app.models import JobLead
from backend.app.rag.resume_index import (
    build_resume_index,
    load_resume_index,
    missing_resume_keywords,
    retrieve_resume_evidence,
    save_resume_index,
)


class ResumeIndexTests(unittest.TestCase):
    def test_build_resume_index_creates_sectioned_evidence(self) -> None:
        text = """
        JACKSON MIAO
        person@example.com
        +61 400000000

        TECHNICAL SKILLS
        Python, SQL, Git, Linux, Docker

        RELEVANT PROJECTS
        Built a FastAPI job tracker with PostgreSQL and automated tests.
        """

        index = build_resume_index(text)

        self.assertGreaterEqual(len(index), 2)
        self.assertEqual(index[0].section, "TECHNICAL SKILLS")
        self.assertIn("python", index[0].keywords)
        self.assertNotIn("@", " ".join(chunk.text for chunk in index))

    def test_build_resume_index_supports_chinese_sections(self) -> None:
        text = """
        张三
        邮箱：person@example.com
        电话：13800000000

        专业技能
        Python、SQL、Docker、FastAPI，熟悉大模型应用和检索增强。

        项目经历
        搭建 AI 求职助手，支持邮件解析、职位匹配、简历证据检索和申请草稿生成。
        """

        index = build_resume_index(text)

        self.assertGreaterEqual(len(index), 2)
        self.assertEqual(index[0].section, "专业技能")
        self.assertIn("大模型", index[0].keywords)
        self.assertIn("检索增强", " ".join(chunk.text for chunk in index))
        self.assertNotIn("@", " ".join(chunk.text for chunk in index))

    def test_retrieve_resume_evidence_finds_relevant_chunks(self) -> None:
        index = build_resume_index(
            """
            TECHNICAL SKILLS
            Python, SQL, Git, Linux, Docker

            RELEVANT PROJECTS
            Built a FastAPI job tracker with PostgreSQL and automated tests.
            """
        )
        lead = JobLead(
            title="Software Engineer Intern",
            company="Example",
            location="Sydney",
            source="test",
            raw_excerpt="Python SQL FastAPI testing",
        )

        matches = retrieve_resume_evidence(lead, index)

        self.assertTrue(matches)
        self.assertIn("python", matches[0].matched_terms)

    def test_missing_resume_keywords_identifies_gaps(self) -> None:
        index = build_resume_index("TECHNICAL SKILLS\nPython, SQL, Git")
        lead = JobLead(
            title="AI Engineer",
            company="Example",
            location="Sydney",
            source="test",
            raw_excerpt="RAG LLM agent AWS cloud",
        )

        missing = missing_resume_keywords(lead, index)

        self.assertIn("rag", missing)
        self.assertIn("llm", missing)

    def test_save_and_load_resume_index_round_trips(self) -> None:
        index = build_resume_index("TECHNICAL SKILLS\nPython, SQL, Git")

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "resume_index.json"
            save_resume_index(index, path)
            loaded = load_resume_index(path)

        self.assertEqual(loaded[0].text, index[0].text)
        self.assertEqual(loaded[0].keywords, index[0].keywords)


if __name__ == "__main__":
    unittest.main()
