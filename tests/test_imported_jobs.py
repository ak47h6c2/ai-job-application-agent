import tempfile
import unittest
from pathlib import Path

from backend.app.services.imported_jobs import load_latest_imported_job, normalize_imported_job, save_imported_job


class ImportedJobTests(unittest.TestCase):
    def test_normalize_imported_job_keeps_chinese_text_and_limits_noise(self) -> None:
        payload = normalize_imported_job(
            {
                "title": "  AI Agent 工程师  ",
                "company": " 示例科技 ",
                "location": " 上海 / 远程 ",
                "url": "https://example.com/jobs/agent",
                "description": "  负责 Agent 工作流\n\n  RAG 与 function calling 集成  ",
                "source": "example.com",
                "imported_at": "2026-05-10T00:00:00+00:00",
            }
        )

        self.assertEqual(payload["title"], "AI Agent 工程师")
        self.assertEqual(payload["company"], "示例科技")
        self.assertIn("RAG 与 function calling", payload["description"])
        self.assertEqual(payload["imported_at"], "2026-05-10T00:00:00+00:00")
        self.assertIn(payload["quality_label"], {"weak", "usable", "strong"})
        self.assertIsInstance(payload["quality_score"], int)

    def test_save_and_load_latest_imported_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            private_dir = Path(tmp_dir)
            saved = save_imported_job(
                {
                    "title": "Software Engineer",
                    "company": "Example AU",
                    "location": "Sydney",
                    "url": "https://example.com/job",
                    "description": "Python backend role with AI workflow experience.",
                    "source": "example.com",
                },
                private_dir,
            )
            loaded = load_latest_imported_job(private_dir)

            self.assertEqual(loaded, saved)
            self.assertTrue((private_dir / "imported_jobs" / "latest.json").exists())


if __name__ == "__main__":
    unittest.main()
