from __future__ import annotations

from backend.app.models import JobApplicationAnalysis, ResumeEvidence, ScoredJobLead
from backend.app.rag.resume_index import missing_resume_keywords, retrieve_resume_evidence


def analyze_scored_lead(
    scored_lead: ScoredJobLead,
    resume_index: list[ResumeEvidence],
    *,
    top_k: int = 3,
) -> JobApplicationAnalysis:
    evidence_matches = retrieve_resume_evidence(scored_lead.lead, resume_index, top_k=top_k)
    missing_keywords = missing_resume_keywords(scored_lead.lead, resume_index)
    return JobApplicationAnalysis(
        scored_lead=scored_lead,
        evidence_matches=evidence_matches,
        missing_keywords=missing_keywords,
    )


def analyze_ranked_leads(
    ranked_leads: list[ScoredJobLead],
    resume_index: list[ResumeEvidence],
    *,
    top_k: int = 3,
) -> list[JobApplicationAnalysis]:
    return [
        analyze_scored_lead(scored_lead, resume_index, top_k=top_k)
        for scored_lead in ranked_leads
    ]
