import tempfile
import unittest
from pathlib import Path

from backend.app.models import (
    JobApplicationAnalysis,
    JobLead,
    ResumeEvidence,
    ResumeEvidenceMatch,
    ScoredJobLead,
)
from backend.app.services.job_agent import draft_to_markdown, save_agent_run, select_jobs
from backend.app.models import AgentRunReport, AgentRunStep
from backend.app.services.draft_generator import generate_application_draft


def make_analysis(title: str, score: int) -> JobApplicationAnalysis:
    lead = JobLead(title=title, company="Example", location="Sydney", source="test")
    evidence = ResumeEvidence(section="PROFILE", text="Python SQL C testing", keywords=("python", "sql"))
    return JobApplicationAnalysis(
        scored_lead=ScoredJobLead(lead=lead, score=score, reasons=("target title match",)),
        evidence_matches=(
            ResumeEvidenceMatch(evidence=evidence, score=20, matched_terms=("python", "sql")),
        ),
        missing_keywords=(),
    )


class JobAgentTests(unittest.TestCase):
    def test_select_jobs_filters_by_score_and_top_limit(self) -> None:
        analyses = [
            make_analysis("Strong", 90),
            make_analysis("Medium", 75),
            make_analysis("Weak", 50),
        ]

        selected = select_jobs(analyses, top=1, min_score=70)

        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].scored_lead.lead.title, "Strong")

    def test_draft_to_markdown_contains_approval_gate(self) -> None:
        draft = generate_application_draft(make_analysis("Software Engineer Intern", 90))

        markdown = draft_to_markdown(draft)

        self.assertIn("Approval required before any external action: yes", markdown)
        self.assertIn("Cover Letter Draft", markdown)

    def test_draft_to_markdown_supports_chinese_headings(self) -> None:
        draft = generate_application_draft(make_analysis("Software Engineer Intern", 90), "zh")

        markdown = draft_to_markdown(draft, "zh")

        self.assertIn("求职信草稿", markdown)
        self.assertIn("对外发送或投递前必须人工确认：是", markdown)

    def test_save_agent_run_writes_json_and_draft_files(self) -> None:
        analysis = make_analysis("Software Engineer Intern", 90)
        draft = generate_application_draft(analysis)

        with tempfile.TemporaryDirectory() as tmp_dir:
            output_dir = Path(tmp_dir)
            report = AgentRunReport(
                goal="test",
                steps=(AgentRunStep("human_approval_gate", "blocked", "No external action."),),
                selected_jobs=(analysis,),
                drafts=(draft,),
                output_dir=str(output_dir),
            )
            save_agent_run(report, output_dir)

            self.assertTrue((output_dir / "agent_run.json").exists())
            self.assertTrue(list((output_dir / "drafts").glob("*.md")))


if __name__ == "__main__":
    unittest.main()
