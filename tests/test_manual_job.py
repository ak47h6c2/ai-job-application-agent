import tempfile
import unittest
from pathlib import Path

from backend.app.models import ResumeEvidence
from backend.app.services.manual_job import run_manual_job_application


class ManualJobTests(unittest.TestCase):
    def test_run_manual_job_application_writes_report_and_uses_job_language(self) -> None:
        resume_index = [
            ResumeEvidence(
                section="项目经历",
                text="使用 Python 和 SQL 搭建测试工具，整理数据库验证结果。",
                keywords=("python", "sql", "测试", "数据库"),
            )
        ]

        with tempfile.TemporaryDirectory() as tmp_dir:
            output_dir = Path(tmp_dir)
            report = run_manual_job_application(
                title="Software Engineer Intern",
                company="Example AU",
                location="Sydney, NSW",
                description="Python SQL testing database internship role for a software engineering intern.",
                url="https://example.com/job",
                resume_index=resume_index,
                output_dir=output_dir,
                language="zh",
            )

            self.assertEqual(len(report.selected_jobs), 1)
            self.assertEqual(len(report.drafts), 1)
            self.assertEqual(report.steps[0].name, "manual_job_input")
            self.assertEqual(report.drafts[0].communication_language, "en")
            self.assertIn("Dear Hiring Team", report.drafts[0].cover_letter)
            self.assertTrue((output_dir / "agent_run.json").exists())
            self.assertTrue(list((output_dir / "drafts").glob("*.md")))


if __name__ == "__main__":
    unittest.main()
