from __future__ import annotations

import os

from backend.app.models import ApplicationDraft, JobApplicationAnalysis, ResumeEvidenceMatch


DISPLAY_TERMS = {
    "c": "C",
    "c++": "C++",
    "sql": "SQL",
    "api": "API",
    "aws": "AWS",
    "ai": "AI",
    "rag": "RAG",
    "llm": "LLM",
    "git": "Git",
    "github": "GitHub",
    "linux": "Linux",
    "docker": "Docker",
    "python": "Python",
}


def display_term(term: str) -> str:
    return DISPLAY_TERMS.get(term.lower(), term)


def display_terms(terms: tuple[str, ...]) -> str:
    return ", ".join(display_term(term) for term in terms)


def applicant_name() -> str:
    return os.getenv("APPLICANT_NAME", "Applicant")


def applicant_summary() -> str:
    return os.getenv(
        "APPLICANT_SUMMARY",
        "a technology student with foundations in Python, SQL, C, data structures, databases, computer networks, and engineering validation work",
    )


def evidence_sentence(matches: tuple[ResumeEvidenceMatch, ...]) -> str:
    if not matches:
        return "my current technical background and project experience"
    best = matches[0].evidence
    keywords = display_terms(best.keywords[:4]) if best.keywords else "relevant technical skills"
    return f"resume evidence from my {best.section.lower()} section, including {keywords}"


def resume_focus_points(analysis: JobApplicationAnalysis) -> tuple[str, ...]:
    lead = analysis.scored_lead.lead
    points = [
        f"Tailor the resume summary toward {lead.title} at {lead.company}.",
        "Put Python, SQL, C, Git, Linux, testing, and database coursework near the top when relevant.",
    ]
    if analysis.evidence_matches:
        for match in analysis.evidence_matches[:2]:
            section = match.evidence.section
            terms = display_terms(match.matched_terms[:5])
            points.append(f"Use evidence from {section}: matched terms include {terms}.")
    if analysis.missing_keywords:
        points.append(f"Consider adding truthful evidence for missing keywords: {display_terms(analysis.missing_keywords[:6])}.")
    return tuple(points)


def application_notes(analysis: JobApplicationAnalysis) -> tuple[str, ...]:
    notes = [
        "Do not submit automatically. Review the job description and generated text first.",
        "Check visa, work rights, location, and internship eligibility before applying.",
    ]
    if analysis.missing_keywords:
        notes.append(
            "Skill gaps to handle honestly: "
            + display_terms(analysis.missing_keywords[:8])
            + "."
        )
    else:
        notes.append("No obvious keyword gap was detected by the local resume index.")
    return tuple(notes)


def generate_cover_letter(analysis: JobApplicationAnalysis) -> str:
    lead = analysis.scored_lead.lead
    evidence = evidence_sentence(analysis.evidence_matches)
    missing = display_terms(analysis.missing_keywords[:4])
    gap_sentence = (
        f"I am also actively building more evidence in areas related to {missing}."
        if missing
        else "I would welcome the chance to contribute and keep learning in a practical engineering environment."
    )
    return (
        f"Dear Hiring Team,\n\n"
        f"I am writing to express my interest in the {lead.title} role at {lead.company}. "
        f"I am {applicant_summary()}.\n\n"
        f"This role is interesting to me because it connects with {evidence}. "
        f"My previous engineering experience also required structured testing, technical reporting, and cross-functional "
        f"communication, which I would bring into this position.\n\n"
        f"{gap_sentence}\n\n"
        f"Thank you for considering my application.\n\n"
        f"Kind regards,\n"
        f"{applicant_name()}"
    )


def generate_recruiter_message(analysis: JobApplicationAnalysis) -> str:
    lead = analysis.scored_lead.lead
    evidence = evidence_sentence(analysis.evidence_matches)
    return (
        f"Hi, I am interested in the {lead.title} role at {lead.company}. "
        f"I am {applicant_summary()}. "
        f"The role seems aligned with {evidence}. I would appreciate the opportunity to apply or learn more."
    )


def generate_application_draft(analysis: JobApplicationAnalysis) -> ApplicationDraft:
    lead = analysis.scored_lead.lead
    return ApplicationDraft(
        job_title=lead.title,
        company=lead.company,
        resume_focus=resume_focus_points(analysis),
        cover_letter=generate_cover_letter(analysis),
        recruiter_message=generate_recruiter_message(analysis),
        application_notes=application_notes(analysis),
        approval_required=True,
    )
