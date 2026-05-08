from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class JobLead:
    title: str
    company: str
    location: str
    source: str
    url: str = ""
    signals: tuple[str, ...] = field(default_factory=tuple)
    raw_excerpt: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "source": self.source,
            "url": self.url,
            "signals": list(self.signals),
            "raw_excerpt": self.raw_excerpt,
        }


@dataclass(frozen=True)
class EmailSummary:
    uid: str
    subject: str
    sender: str
    date: str
    folder: str = "INBOX"
    seen: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "uid": self.uid,
            "subject": self.subject,
            "sender": self.sender,
            "date": self.date,
            "folder": self.folder,
            "seen": self.seen,
        }


@dataclass(frozen=True)
class ResumeProfile:
    target_titles: tuple[str, ...]
    preferred_locations: tuple[str, ...]
    skills: tuple[str, ...]
    strong_keywords: tuple[str, ...]
    stretch_keywords: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ResumeEvidence:
    section: str
    text: str
    keywords: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, object]:
        return {
            "section": self.section,
            "text": self.text,
            "keywords": list(self.keywords),
        }


@dataclass(frozen=True)
class ResumeEvidenceMatch:
    evidence: ResumeEvidence
    score: int
    matched_terms: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "evidence": self.evidence.to_dict(),
            "score": self.score,
            "matched_terms": list(self.matched_terms),
        }


@dataclass(frozen=True)
class ScoredJobLead:
    lead: JobLead
    score: int
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "lead": self.lead.to_dict(),
            "score": self.score,
            "reasons": list(self.reasons),
        }


@dataclass(frozen=True)
class JobApplicationAnalysis:
    scored_lead: ScoredJobLead
    evidence_matches: tuple[ResumeEvidenceMatch, ...]
    missing_keywords: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "scored_lead": self.scored_lead.to_dict(),
            "evidence_matches": [match.to_dict() for match in self.evidence_matches],
            "missing_keywords": list(self.missing_keywords),
        }


@dataclass(frozen=True)
class ApplicationDraft:
    job_title: str
    company: str
    resume_focus: tuple[str, ...]
    cover_letter: str
    recruiter_message: str
    application_notes: tuple[str, ...]
    communication_language: str = "en"
    approval_required: bool = True

    def to_dict(self) -> dict[str, object]:
        return {
            "job_title": self.job_title,
            "company": self.company,
            "resume_focus": list(self.resume_focus),
            "cover_letter": self.cover_letter,
            "recruiter_message": self.recruiter_message,
            "application_notes": list(self.application_notes),
            "communication_language": self.communication_language,
            "approval_required": self.approval_required,
        }


@dataclass(frozen=True)
class AgentRunStep:
    name: str
    status: str
    summary: str

    def to_dict(self) -> dict[str, str]:
        return {
            "name": self.name,
            "status": self.status,
            "summary": self.summary,
        }


@dataclass(frozen=True)
class AgentRunReport:
    goal: str
    steps: tuple[AgentRunStep, ...]
    selected_jobs: tuple[JobApplicationAnalysis, ...]
    drafts: tuple[ApplicationDraft, ...]
    output_dir: str
    external_actions_blocked: bool = True

    def to_dict(self) -> dict[str, object]:
        return {
            "goal": self.goal,
            "steps": [step.to_dict() for step in self.steps],
            "selected_jobs": [job.to_dict() for job in self.selected_jobs],
            "drafts": [draft.to_dict() for draft in self.drafts],
            "output_dir": self.output_dir,
            "external_actions_blocked": self.external_actions_blocked,
        }
