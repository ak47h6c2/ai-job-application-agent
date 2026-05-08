from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app.models import (
    EmailSummary,
    JobApplicationAnalysis,
    JobLead,
    ResumeEvidence,
    ResumeProfile,
    ScoredJobLead,
)
from backend.app.parsers.job_email_parser import parse_job_email
from backend.app.sample_profile import DEFAULT_PROFILE
from backend.app.services.application_analysis import analyze_ranked_leads
from backend.app.services.matcher import rank_job_leads
from backend.app.tools.qq_mail_mcp_client import QQMailMCPClient


JOB_EMAIL_KEYWORDS = (
    "linkedin",
    "\u9886\u82f1",
    "job",
    "jobs",
    "\u804c\u4f4d",
    "\u62db\u8058",
    "recruit",
    "intern",
    "internship",
    "engineer",
    "developer",
    "graduate",
    "51job",
    "\u524d\u7a0b\u65e0\u5fe7",
)


@dataclass(frozen=True)
class IngestionResult:
    scanned_messages: list[EmailSummary]
    job_messages: list[EmailSummary]
    leads: list[JobLead]
    ranked: list[ScoredJobLead]
    analyses: list[JobApplicationAnalysis] | None = None
    output_path: Path | None = None


def is_job_related_message(summary: dict[str, Any]) -> bool:
    searchable = " ".join(
        [
            str(summary.get("subject", "")),
            str(summary.get("from", "")),
            str(summary.get("sender", "")),
        ]
    ).lower()
    return any(keyword.lower() in searchable for keyword in JOB_EMAIL_KEYWORDS)


def email_summary_from_tool_payload(payload: dict[str, Any], folder: str) -> EmailSummary:
    return EmailSummary(
        uid=str(payload.get("uid", "")),
        subject=str(payload.get("subject", "")),
        sender=str(payload.get("from", payload.get("sender", ""))),
        date=str(payload.get("date", "")),
        folder=folder,
        seen=bool(payload.get("seen", False)),
    )


def serialize_ingestion_result(result: IngestionResult) -> dict[str, object]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scanned_messages": [message.to_dict() for message in result.scanned_messages],
        "job_messages": [message.to_dict() for message in result.job_messages],
        "leads": [lead.to_dict() for lead in result.leads],
        "ranked": [scored.to_dict() for scored in result.ranked],
        "analyses": [analysis.to_dict() for analysis in result.analyses] if result.analyses else [],
    }


def save_ingestion_result(result: IngestionResult, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(serialize_ingestion_result(result), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def normalize_lead_key(lead: JobLead) -> tuple[str, str, str]:
    return (
        " ".join(lead.title.lower().split()),
        " ".join(lead.company.lower().split()),
        " ".join(lead.location.lower().split()),
    )


def dedupe_leads(leads: list[JobLead]) -> list[JobLead]:
    unique: list[JobLead] = []
    seen: set[tuple[str, str, str]] = set()
    for lead in leads:
        key = normalize_lead_key(lead)
        if key in seen:
            continue
        seen.add(key)
        unique.append(lead)
    return unique


def scan_qq_mail_for_jobs(
    *,
    since: str,
    folder: str = "INBOX",
    limit: int = 50,
    candidate_limit: int = 250,
    max_chars: int = 12000,
    profile: ResumeProfile = DEFAULT_PROFILE,
    resume_index: list[ResumeEvidence] | None = None,
    output_path: Path | None = None,
    client: QQMailMCPClient | None = None,
) -> IngestionResult:
    mail_client = client or QQMailMCPClient()
    raw_messages = mail_client.list_messages(
        folder=folder,
        since=since,
        limit=limit,
        candidate_limit=candidate_limit,
    )
    scanned = [email_summary_from_tool_payload(message, folder) for message in raw_messages]
    job_candidates = [message for message in raw_messages if is_job_related_message(message)]
    job_summaries = [email_summary_from_tool_payload(message, folder) for message in job_candidates]

    leads: list[JobLead] = []
    for message in job_candidates:
        uid = str(message.get("uid", ""))
        if not uid:
            continue
        payload = mail_client.read_message(uid=uid, folder=folder, max_chars=max_chars)
        email_text = str(payload.get("text", ""))
        source = f"{folder}:{uid}"
        leads.extend(parse_job_email(email_text, source=source))

    leads = dedupe_leads(leads)
    ranked = rank_job_leads(leads, profile)
    analyses = analyze_ranked_leads(ranked, resume_index) if resume_index else None
    result = IngestionResult(
        scanned_messages=scanned,
        job_messages=job_summaries,
        leads=leads,
        ranked=ranked,
        analyses=analyses,
        output_path=output_path,
    )
    if output_path:
        save_ingestion_result(result, output_path)
    return result
