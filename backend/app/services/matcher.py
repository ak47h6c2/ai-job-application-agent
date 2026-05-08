from __future__ import annotations

from backend.app.models import JobLead, ResumeProfile, ScoredJobLead


def normalize_for_matching(text: str) -> str:
    return text.lower().replace("engineering", "engineer")


def contains_any(text: str, needles: tuple[str, ...]) -> list[str]:
    lowered = normalize_for_matching(text)
    return [needle for needle in needles if normalize_for_matching(needle) in lowered]


def score_job_lead(lead: JobLead, profile: ResumeProfile) -> ScoredJobLead:
    searchable = " ".join(
        [
            lead.title,
            lead.company,
            lead.location,
            " ".join(lead.signals),
            lead.raw_excerpt,
        ]
    )
    reasons: list[str] = []
    score = 20

    title_matches = contains_any(lead.title, profile.target_titles)
    if title_matches:
        score += 35
        reasons.append("target title match")
    else:
        keyword_matches = contains_any(lead.title, profile.strong_keywords)
        if keyword_matches:
            score += min(25, len(keyword_matches) * 7)
            reasons.append("software role keywords")

    location_matches = contains_any(lead.location, profile.preferred_locations)
    if location_matches:
        score += 15
        reasons.append("preferred location")

    skill_matches = contains_any(searchable, profile.skills)
    if skill_matches:
        score += min(20, len(skill_matches) * 4)
        reasons.append("resume skill overlap")

    stretch_matches = contains_any(searchable, profile.stretch_keywords)
    if stretch_matches:
        score += min(10, len(stretch_matches) * 3)
        reasons.append("AI/cloud stretch keyword")

    if lead.signals:
        score += min(10, len(lead.signals) * 4)
        reasons.append("positive job-alert signal")

    return ScoredJobLead(lead=lead, score=min(score, 100), reasons=tuple(reasons))


def rank_job_leads(leads: list[JobLead], profile: ResumeProfile) -> list[ScoredJobLead]:
    scored = [score_job_lead(lead, profile) for lead in leads]
    return sorted(scored, key=lambda item: item.score, reverse=True)
