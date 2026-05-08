import os
import unittest

from backend.app.models import JobApplicationAnalysis, JobLead, ResumeEvidence, ResumeEvidenceMatch, ScoredJobLead
from backend.app.services.draft_generator import generate_application_draft


class DraftGeneratorTests(unittest.TestCase):
    def tearDown(self) -> None:
        os.environ.pop("APPLICANT_NAME", None)
        os.environ.pop("APPLICANT_SUMMARY", None)

    def test_generate_application_draft_requires_approval(self) -> None:
        os.environ["APPLICANT_NAME"] = "Test Applicant"
        os.environ["APPLICANT_SUMMARY"] = "a software student with Python and SQL experience"
        lead = JobLead(
            title="Software Engineer Intern",
            company="Example Company",
            location="Sydney",
            source="test",
            raw_excerpt="Python SQL testing",
        )
        evidence = ResumeEvidence(
            section="TECHNICAL SKILLS",
            text="Python, SQL, Git, Linux, Docker",
            keywords=("python", "sql", "git"),
        )
        analysis = JobApplicationAnalysis(
            scored_lead=ScoredJobLead(lead=lead, score=82, reasons=("target title match",)),
            evidence_matches=(
                ResumeEvidenceMatch(
                    evidence=evidence,
                    score=30,
                    matched_terms=("python", "sql"),
                ),
            ),
            missing_keywords=("aws",),
        )

        draft = generate_application_draft(analysis)

        self.assertTrue(draft.approval_required)
        self.assertIn("Software Engineer Intern", draft.cover_letter)
        self.assertIn("Test Applicant", draft.cover_letter)
        self.assertIn("Example Company", draft.recruiter_message)
        self.assertTrue(any("AWS" in note for note in draft.application_notes))

    def test_generate_application_draft_supports_chinese_output(self) -> None:
        os.environ["APPLICANT_NAME"] = "测试申请人"
        lead = JobLead(
            title="测试开发实习生",
            company="示例公司",
            location="上海",
            source="test",
            raw_excerpt="Python SQL 测试 数据库",
        )
        evidence = ResumeEvidence(
            section="项目经历",
            text="使用 Python 和 SQL 搭建测试工具，整理数据库验证结果。",
            keywords=("python", "sql", "测试", "数据库"),
        )
        analysis = JobApplicationAnalysis(
            scored_lead=ScoredJobLead(lead=lead, score=82, reasons=("target title match",)),
            evidence_matches=(
                ResumeEvidenceMatch(
                    evidence=evidence,
                    score=30,
                    matched_terms=("python", "sql", "测试"),
                ),
            ),
            missing_keywords=("大模型",),
        )

        draft = generate_application_draft(analysis, "zh")

        self.assertTrue(draft.approval_required)
        self.assertIn("我想申请", draft.cover_letter)
        self.assertIn("项目经历", draft.cover_letter)
        self.assertIn("测试申请人", draft.cover_letter)
        self.assertEqual(draft.communication_language, "zh")
        self.assertTrue(any("能力缺口" in note for note in draft.application_notes))

    def test_generate_application_draft_uses_english_for_australia_even_in_chinese_ui(self) -> None:
        lead = JobLead(
            title="Software Engineer Intern",
            company="Google",
            location="悉尼, NSW",
            source="test",
            raw_excerpt="Python SQL testing database",
        )
        evidence = ResumeEvidence(
            section="项目经历",
            text="使用 Python 和 SQL 搭建测试工具，整理数据库验证结果。",
            keywords=("python", "sql", "测试", "数据库"),
        )
        analysis = JobApplicationAnalysis(
            scored_lead=ScoredJobLead(lead=lead, score=82, reasons=("target title match",)),
            evidence_matches=(
                ResumeEvidenceMatch(
                    evidence=evidence,
                    score=30,
                    matched_terms=("python", "sql", "测试"),
                ),
            ),
            missing_keywords=("aws",),
        )

        draft = generate_application_draft(analysis, "zh")

        self.assertEqual(draft.communication_language, "en")
        self.assertIn("Dear Hiring Team", draft.cover_letter)
        self.assertIn("databases", draft.cover_letter)
        self.assertIn("Hi, I am interested", draft.recruiter_message)
        self.assertTrue(any("投递前确认" in note for note in draft.application_notes))


if __name__ == "__main__":
    unittest.main()
