from __future__ import annotations

import json
import re
from pathlib import Path

from backend.app.models import JobLead, ResumeEvidence, ResumeEvidenceMatch


SECTION_NAMES = {
    "profile",
    "education",
    "technical skills",
    "work experience",
    "relevant projects",
    "leadership & awards",
    "professional development",
}

IMPORTANT_TERMS = (
    "python",
    "sql",
    "c",
    "c++",
    "git",
    "github",
    "linux",
    "ubuntu",
    "docker",
    "fastapi",
    "react",
    "typescript",
    "javascript",
    "postgresql",
    "sqlite",
    "api",
    "database",
    "data structures",
    "algorithms",
    "computer networks",
    "testing",
    "validation",
    "automation",
    "embedded",
    "stm32",
    "ai",
    "agent",
    "rag",
    "llm",
    "aws",
    "cloud",
    "software",
    "developer",
    "engineer",
    "intern",
    "graduate",
)

STOP_WORDS = {
    "and",
    "the",
    "for",
    "with",
    "from",
    "this",
    "that",
    "your",
    "you",
    "are",
    "was",
    "were",
    "into",
    "using",
    "view",
    "job",
    "jobs",
    "https",
    "www",
    "com",
}


def normalize_text(text: str) -> str:
    return " ".join(text.replace("\r", "\n").split())


def tokenize(text: str) -> set[str]:
    normalized = text.lower().replace("engineering", "engineer")
    tokens = set(re.findall(r"[a-z][a-z0-9+#.]{1,}", normalized))
    return {token for token in tokens if token not in STOP_WORDS and len(token) > 2}


def extract_keywords(text: str) -> tuple[str, ...]:
    lowered = text.lower().replace("engineering", "engineer")
    found = [term for term in IMPORTANT_TERMS if term in lowered]
    return tuple(dict.fromkeys(found))


def should_skip_chunk(section: str, text: str) -> bool:
    lowered = text.lower()
    if section == "ignore":
        return True
    private_markers = ("@", "linkedin.com/in/", "phone", "+61")
    return any(marker in lowered for marker in private_markers)


def section_for_line(line: str, current_section: str) -> str:
    normalized = line.strip().lower()
    return line.strip() if normalized in SECTION_NAMES else current_section


def build_resume_index(text: str) -> list[ResumeEvidence]:
    current_section = "ignore"
    chunks: list[ResumeEvidence] = []
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        chunk_text = normalize_text(" ".join(buffer))
        if len(chunk_text) >= 15 and not should_skip_chunk(current_section, chunk_text):
            chunks.append(
                ResumeEvidence(
                    section=current_section,
                    text=chunk_text,
                    keywords=extract_keywords(chunk_text),
                )
            )
        buffer.clear()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            flush()
            continue
        next_section = section_for_line(line, current_section)
        if next_section != current_section:
            flush()
            current_section = next_section
            continue
        buffer.append(line)
        if sum(len(item) for item in buffer) > 700:
            flush()
    flush()
    return chunks


def extract_pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def save_resume_index(index: list[ResumeEvidence], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps([evidence.to_dict() for evidence in index], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_resume_index(path: Path) -> list[ResumeEvidence]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [
        ResumeEvidence(
            section=str(item.get("section", "general")),
            text=str(item.get("text", "")),
            keywords=tuple(str(keyword) for keyword in item.get("keywords", [])),
        )
        for item in payload
    ]


def build_and_save_resume_index(pdf_path: Path, output_path: Path) -> list[ResumeEvidence]:
    text = extract_pdf_text(pdf_path)
    index = build_resume_index(text)
    save_resume_index(index, output_path)
    return index


def query_terms_for_job(lead: JobLead) -> set[str]:
    return tokenize(" ".join([lead.title, lead.company, lead.location, lead.raw_excerpt]))


def retrieve_resume_evidence(
    lead: JobLead,
    index: list[ResumeEvidence],
    *,
    top_k: int = 3,
) -> tuple[ResumeEvidenceMatch, ...]:
    query_terms = query_terms_for_job(lead)
    matches: list[ResumeEvidenceMatch] = []
    for evidence in index:
        evidence_terms = tokenize(" ".join([evidence.text, " ".join(evidence.keywords)]))
        matched_terms = tuple(sorted(query_terms.intersection(evidence_terms)))
        if len(matched_terms) < 2:
            continue
        score = len(matched_terms) * 10 + len(set(evidence.keywords).intersection(query_terms)) * 5
        matches.append(
            ResumeEvidenceMatch(
                evidence=evidence,
                score=score,
                matched_terms=matched_terms,
            )
        )
    matches.sort(key=lambda match: match.score, reverse=True)
    return tuple(matches[:top_k])


def missing_resume_keywords(lead: JobLead, index: list[ResumeEvidence]) -> tuple[str, ...]:
    resume_text = " ".join(evidence.text for evidence in index).lower().replace("engineering", "engineer")
    job_text = " ".join([lead.title, lead.company, lead.location, lead.raw_excerpt]).lower()
    job_keywords = [term for term in IMPORTANT_TERMS if term in job_text]
    missing = [term for term in job_keywords if term not in resume_text]
    return tuple(dict.fromkeys(missing))
