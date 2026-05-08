import unittest

from backend.app.models import JobLead
from backend.app.sample_profile import DEFAULT_PROFILE
from backend.app.services.matcher import rank_job_leads, score_job_lead


class MatcherTests(unittest.TestCase):
    def test_score_job_lead_rewards_target_role_and_location(self) -> None:
        lead = JobLead(
            title="Software Engineer Intern",
            company="Example Company",
            location="Sydney",
            source="test",
            signals=("high skill match",),
            raw_excerpt="Python SQL Git internship",
        )

        scored = score_job_lead(lead, DEFAULT_PROFILE)

        self.assertGreaterEqual(scored.score, 80)
        self.assertIn("target title match", scored.reasons)
        self.assertIn("preferred location", scored.reasons)

    def test_score_job_lead_matches_engineering_and_engineer_wording(self) -> None:
        lead = JobLead(
            title="Software Engineering Intern, Summer 2026",
            company="Example Company",
            location="Sydney",
            source="test",
            raw_excerpt="Python SQL Git",
        )

        scored = score_job_lead(lead, DEFAULT_PROFILE)

        self.assertIn("target title match", scored.reasons)

    def test_rank_job_leads_orders_by_score(self) -> None:
        strong = JobLead(
            title="Software Engineer Intern",
            company="Example Company",
            location="Sydney",
            source="test",
            raw_excerpt="Python SQL Git",
        )
        weak = JobLead(
            title="Retail Assistant",
            company="Example Store",
            location="Perth",
            source="test",
            raw_excerpt="Customer service",
        )

        ranked = rank_job_leads([weak, strong], DEFAULT_PROFILE)

        self.assertEqual(ranked[0].lead.title, "Software Engineer Intern")


if __name__ == "__main__":
    unittest.main()
