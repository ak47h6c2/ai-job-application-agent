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


if __name__ == "__main__":
    unittest.main()
