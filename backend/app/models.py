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
