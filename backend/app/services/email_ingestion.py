from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

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
from backend.app.services.job_url_reader import JobUrlPreview, read_job_posting_from_url
from backend.app.services.matcher import rank_job_leads
from backend.app.tools.qq_mail_mcp_client import QQMailMCPClient


JOB_ALERT_SENDERS = (
    "jobalerts-noreply@linkedin.com",
    "jobs-listings@linkedin.com",
)
LINKEDIN_NON_JOB_SUBJECT_MARKERS = (
    "\u6210\u4e3a\u597d\u53cb",
    "\u65b0\u6d88\u606f",
    "\u767b\u5f55\u63d0\u9192",
    "\u767b\u9304\u63d0\u9192",
    "\u5e10\u53f7\u767b\u5f55",
    "\u8d26\u53f7\u767b\u5f55",
    "connection",
    "message",
    "login",
    "security",
    "password",
)
CHINESE_JOB_KEYWORDS = (
    "\u804c\u4f4d",
    "\u804c\u4e1a\u673a\u4f1a",
    "\u6c42\u804c",
    "\u5c97\u4f4d",
    "\u62db\u8058",
    "\u6b63\u5728\u62db\u8058",
    "\u5b9e\u4e60",
    "\u5b9e\u4e60\u751f",
    "\u5de5\u7a0b\u5e08",
    "\u8f6f\u4ef6\u5de5\u7a0b",
    "\u5f00\u53d1",
    "\u6821\u62db",
    "\u5185\u63a8",
)
ENGLISH_JOB_TERMS = (
    "job",
    "jobs",
    "role",
    "roles",
    "career",
    "careers",
    "recruit",
    "recruiting",
    "intern",
    "internship",
    "engineer",
    "engineering",
    "developer",
    "graduate",
    "graduate program",
    "hiring",
    "position",
)
TARGETED_MAIL_FROM_SEARCHES = (
    "gradconnection",
    "seek",
    "career",
    "careers",
    "recruit",
    "unsw",
    "connect",
    "careerhub",
    "prosple",
    "handshake",
    "workday",
    "greenhouse",
    "lever",
    "smartrecruiters",
    "successfactors",
    "ashby",
)
TARGETED_MAIL_SUBJECT_SEARCHES = (
    "internship",
    "intern",
    "graduate",
    "graduate program",
    "job",
    "jobs",
    "career",
    "hiring",
    "recruit",
    "\u804c\u4e1a",
    "\u804c\u4e1a\u673a\u4f1a",
    "\u6c42\u804c",
    "\u62db\u8058",
    "\u5b9e\u4e60",
    "\u5c97\u4f4d",
    "\u5185\u63a8",
)

JobPageReader = Callable[[str], JobUrlPreview]


@dataclass(frozen=True)
class IngestionResult:
    scanned_messages: list[EmailSummary]
    job_messages: list[EmailSummary]
    leads: list[JobLead]
    ranked: list[ScoredJobLead]
    analyses: list[JobApplicationAnalysis] | None = None
    output_path: Path | None = None
    job_page_read_attempts: int = 0
    job_page_read_successes: int = 0
    job_page_read_failures: int = 0
    scan_metadata: dict[str, object] = field(default_factory=dict)


def is_job_related_message(summary: dict[str, Any]) -> bool:
    subject = str(summary.get("subject", ""))
    sender = " ".join([str(summary.get("from", "")), str(summary.get("sender", ""))])
    subject_lower = subject.lower()
    sender_lower = sender.lower()
    searchable = f"{subject} {sender}".lower()

    if "linkedin" in sender_lower or "\u9886\u82f1" in sender:
        if any(marker in subject_lower for marker in LINKEDIN_NON_JOB_SUBJECT_MARKERS):
            return False
        if any(sender_marker in sender_lower for sender_marker in JOB_ALERT_SENDERS):
            return True
        return has_job_keyword(subject)

    return has_job_keyword(searchable)


def has_job_keyword(text: str) -> bool:
    lowered = text.lower()
    if any(keyword in text for keyword in CHINESE_JOB_KEYWORDS):
        return True
    return any(
        re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", lowered)
        for term in ENGLISH_JOB_TERMS
    )


def email_summary_from_tool_payload(payload: dict[str, Any], folder: str) -> EmailSummary:
    return EmailSummary(
        uid=str(payload.get("uid", "")),
        subject=str(payload.get("subject", "")),
        sender=str(payload.get("from", payload.get("sender", ""))),
        date=str(payload.get("date", "")),
        folder=folder,
        seen=bool(payload.get("seen", False)),
    )


def mail_source_label(message: EmailSummary) -> str:
    searchable = f"{message.subject} {message.sender}".lower()
    if "linkedin" in searchable or "\u9886\u82f1" in searchable:
        return "LinkedIn"
    if "gradconnection" in searchable or "seek grad" in searchable:
        return "SEEK Grad / GradConnection"
    if "unsw" in searchable or "csa" in searchable:
        return "UNSW / CSA"
    if any(marker in searchable for marker in ("careerhub", "prosple", "handshake")):
        return "Career platforms"
    if any(
        marker in searchable
        for marker in ("workday", "greenhouse", "lever", "smartrecruiters", "successfactors", "ashby")
    ):
        return "Company ATS"
    if any(marker in searchable for marker in ("career", "careers", "recruit")):
        return "Recruiting mail"
    return "Other"


def mail_message_key(message: EmailSummary) -> str:
    return f"{message.folder}:{message.uid}"


def sample_subject(subject: str, limit: int = 96) -> str:
    compact = " ".join(subject.split())
    return compact if len(compact) <= limit else f"{compact[:limit]}..."


def build_scan_metadata(
    *,
    folder: str,
    since: str,
    scanned: list[EmailSummary],
    job_messages: list[EmailSummary],
    leads: list[JobLead],
) -> dict[str, object]:
    scanned_counts: dict[str, int] = {}
    job_counts: dict[str, int] = {}
    lead_counts: dict[str, int] = {}
    message_lead_counts: dict[str, int] = {}
    samples: dict[str, list[str]] = {}
    source_by_message: dict[str, str] = {}
    for message in scanned:
        label = mail_source_label(message)
        scanned_counts[label] = scanned_counts.get(label, 0) + 1
        source_by_message[mail_message_key(message)] = label
        if len(samples.get(label, [])) < 2:
            samples.setdefault(label, []).append(sample_subject(message.subject))
    for message in job_messages:
        label = mail_source_label(message)
        job_counts[label] = job_counts.get(label, 0) + 1
    for lead in leads:
        label = source_by_message.get(lead.source, "Other")
        lead_counts[label] = lead_counts.get(label, 0) + 1
        message_lead_counts[lead.source] = message_lead_counts.get(lead.source, 0) + 1

    labels = sorted(
        set(scanned_counts) | set(job_counts) | set(lead_counts),
        key=lambda label: (lead_counts.get(label, 0), job_counts.get(label, 0), scanned_counts.get(label, 0), label),
        reverse=True,
    )
    review_messages = [
        {
            "message_key": mail_message_key(message),
            "uid": message.uid,
            "folder": message.folder,
            "subject": message.subject,
            "sender": message.sender,
            "date": message.date,
            "source_name": mail_source_label(message),
            "reason": "job_mail_without_leads",
        }
        for message in job_messages
        if message_lead_counts.get(mail_message_key(message), 0) == 0
    ]
    review_source_names = {item["source_name"] for item in review_messages}
    source_counts = []
    for label in labels:
        leads_for_source = lead_counts.get(label, 0)
        job_messages_for_source = job_counts.get(label, 0)
        if leads_for_source and label in review_source_names:
            status = "partial"
        elif leads_for_source:
            status = "parsed"
        elif job_messages_for_source:
            status = "needs_review"
        else:
            status = "checked"
        source_counts.append(
            {
                "name": label,
                "scanned": scanned_counts.get(label, 0),
                "job_messages": job_messages_for_source,
                "leads": leads_for_source,
                "status": status,
                "sample_subjects": samples.get(label, []),
            }
        )
    attention_items = [
        {
            "name": source["name"],
            "reason": "job_mail_without_leads",
            "job_messages": source["job_messages"],
            "scanned": source["scanned"],
        }
        for source in source_counts
        if source["status"] in {"needs_review", "partial"}
    ]
    return {
        "folder": folder,
        "since": since,
        "scan_strategy": "recent_plus_source_backfill",
        "diagnostic_version": 2,
        "scanned_count": len(scanned),
        "job_message_count": len(job_messages),
        "lead_count": len(leads),
        "source_counts": source_counts,
        "attention_items": attention_items,
        "review_messages": review_messages[:12],
        "backfill_sources": list(TARGETED_MAIL_FROM_SEARCHES),
    }


def merge_message_payloads(messages: list[dict[str, Any]], folder: str) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for message in messages:
        uid = str(message.get("uid", ""))
        message_folder = str(message.get("folder") or folder)
        key = (message_folder, uid)
        if not uid or key in seen:
            continue
        seen.add(key)
        unique.append(message)
    return unique


def collect_mail_scan_pool(
    mail_client: Any,
    *,
    folder: str,
    since: str,
    limit: int,
    candidate_limit: int,
) -> list[dict[str, Any]]:
    list_job_scan_pool = getattr(mail_client, "list_job_scan_pool", None)
    if callable(list_job_scan_pool):
        try:
            return merge_message_payloads(
                list_job_scan_pool(
                    folder=folder,
                    since=since,
                    limit=limit,
                    candidate_limit=candidate_limit,
                    from_terms=TARGETED_MAIL_FROM_SEARCHES,
                    subject_terms=TARGETED_MAIL_SUBJECT_SEARCHES,
                ),
                folder,
            )
        except Exception:
            pass

    messages = mail_client.list_messages(
        folder=folder,
        since=since,
        limit=limit,
        candidate_limit=candidate_limit,
    )

    search_messages = getattr(mail_client, "search_messages", None)
    if not callable(search_messages):
        return merge_message_payloads(messages, folder)

    targeted_limit = min(max(limit, 50), 100)
    for sender in TARGETED_MAIL_FROM_SEARCHES:
        try:
            messages.extend(
                search_messages(
                    folder=folder,
                    since=since,
                    limit=targeted_limit,
                    candidate_limit=candidate_limit,
                    from_contains=sender,
                )
            )
        except Exception:
            continue
    for subject in TARGETED_MAIL_SUBJECT_SEARCHES:
        try:
            messages.extend(
                search_messages(
                    folder=folder,
                    since=since,
                    limit=targeted_limit,
                    candidate_limit=candidate_limit,
                    subject_contains=subject,
                )
            )
        except Exception:
            continue

    return merge_message_payloads(messages, folder)


def serialize_ingestion_result(result: IngestionResult) -> dict[str, object]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scanned_messages": [message.to_dict() for message in result.scanned_messages],
        "job_messages": [message.to_dict() for message in result.job_messages],
        "leads": [lead.to_dict() for lead in result.leads],
        "ranked": [scored.to_dict() for scored in result.ranked],
        "analyses": [analysis.to_dict() for analysis in result.analyses] if result.analyses else [],
        "job_page_reads": {
            "attempted": result.job_page_read_attempts,
            "succeeded": result.job_page_read_successes,
            "failed": result.job_page_read_failures,
        },
        "scan_metadata": result.scan_metadata,
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


def unique_signals(*groups: tuple[str, ...]) -> tuple[str, ...]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for signal in group:
            normalized = " ".join(signal.split())
            if not normalized or normalized.lower() in seen:
                continue
            seen.add(normalized.lower())
            merged.append(normalized)
    return tuple(merged)


def lead_from_job_page(lead: JobLead, preview: JobUrlPreview) -> JobLead:
    return replace(
        lead,
        title=preview.title or lead.title,
        company=preview.company or lead.company,
        location=preview.location or lead.location,
        url=preview.url or lead.url,
        signals=unique_signals(
            lead.signals,
            (
                "auto-read full job description",
                f"job page quality: {preview.quality_label}",
                f"job page source: {preview.extraction_source}",
            ),
        ),
        raw_excerpt=preview.description or lead.raw_excerpt,
    )


def mark_job_page_read_failed(lead: JobLead) -> JobLead:
    return replace(
        lead,
        signals=unique_signals(
            lead.signals,
            ("needs logged-in page read", "email snippet only"),
        ),
    )


def hydrate_ranked_leads_from_job_pages(
    ranked: list[ScoredJobLead],
    *,
    limit: int,
    reader: JobPageReader,
) -> tuple[list[JobLead], int, int, int]:
    hydrated: list[JobLead] = []
    attempts = 0
    successes = 0
    failures = 0
    for scored in ranked:
        lead = scored.lead
        if lead.url and attempts < limit:
            attempts += 1
            try:
                hydrated.append(lead_from_job_page(lead, reader(lead.url)))
                successes += 1
                continue
            except Exception:
                # A blocked or login-only job site should not fail the whole mailbox scan.
                hydrated.append(mark_job_page_read_failed(lead))
                failures += 1
                continue
        hydrated.append(lead)
    return hydrated, attempts, successes, failures


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
    auto_read_job_pages: bool = True,
    auto_read_limit: int = 3,
    job_page_reader: JobPageReader | None = None,
) -> IngestionResult:
    mail_client = client or QQMailMCPClient()
    raw_messages = collect_mail_scan_pool(
        mail_client,
        folder=folder,
        since=since,
        limit=limit,
        candidate_limit=candidate_limit,
    )
    scanned = [email_summary_from_tool_payload(message, folder) for message in raw_messages]
    job_candidates = [message for message in raw_messages if is_job_related_message(message)]
    job_summaries = [email_summary_from_tool_payload(message, folder) for message in job_candidates]

    leads: list[JobLead] = []
    bulk_payloads: dict[str, dict[str, Any]] = {}
    read_messages_bulk = getattr(mail_client, "read_messages_bulk", None)
    if callable(read_messages_bulk):
        try:
            bulk_payloads = read_messages_bulk(
                uids=[str(message.get("uid", "")) for message in job_candidates if message.get("uid")],
                folder=folder,
                max_chars=max_chars,
            )
        except Exception:
            bulk_payloads = {}
    for message in job_candidates:
        uid = str(message.get("uid", ""))
        if not uid:
            continue
        payload = bulk_payloads.get(uid) or mail_client.read_message(uid=uid, folder=folder, max_chars=max_chars)
        email_text = "\n".join(
            value
            for value in (
                f"Subject: {message.get('subject', '')}",
                str(payload.get("text", "")),
            )
            if value
        )
        source = f"{folder}:{uid}"
        leads.extend(parse_job_email(email_text, source=source))

    leads = dedupe_leads(leads)
    ranked = rank_job_leads(leads, profile)
    page_attempts = 0
    page_successes = 0
    page_failures = 0
    if auto_read_job_pages and auto_read_limit > 0:
        leads, page_attempts, page_successes, page_failures = hydrate_ranked_leads_from_job_pages(
            ranked,
            limit=auto_read_limit,
            reader=job_page_reader or read_job_posting_from_url,
        )
        ranked = rank_job_leads(leads, profile)
    analyses = analyze_ranked_leads(ranked, resume_index) if resume_index else None
    scan_metadata = build_scan_metadata(
        folder=folder,
        since=since,
        scanned=scanned,
        job_messages=job_summaries,
        leads=leads,
    )
    result = IngestionResult(
        scanned_messages=scanned,
        job_messages=job_summaries,
        leads=leads,
        ranked=ranked,
        analyses=analyses,
        output_path=output_path,
        job_page_read_attempts=page_attempts,
        job_page_read_successes=page_successes,
        job_page_read_failures=page_failures,
        scan_metadata=scan_metadata,
    )
    if output_path:
        save_ingestion_result(result, output_path)
    return result
