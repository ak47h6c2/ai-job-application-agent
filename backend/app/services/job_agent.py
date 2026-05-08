from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from backend.app.models import AgentRunReport, AgentRunStep, ApplicationDraft, JobApplicationAnalysis, ResumeEvidence
from backend.app.services.draft_generator import generate_application_draft
from backend.app.services.email_ingestion import IngestionResult, scan_qq_mail_for_jobs


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "job"


def select_jobs(
    analyses: list[JobApplicationAnalysis],
    *,
    top: int,
    min_score: int,
) -> tuple[JobApplicationAnalysis, ...]:
    selected = [
        analysis
        for analysis in analyses
        if analysis.scored_lead.score >= min_score
    ]
    return tuple(selected[:top])


def draft_to_markdown(draft: ApplicationDraft) -> str:
    focus = "\n".join(f"- {item}" for item in draft.resume_focus)
    notes = "\n".join(f"- {item}" for item in draft.application_notes)
    return (
        f"# {draft.job_title} - {draft.company}\n\n"
        f"## Resume Focus\n\n{focus}\n\n"
        f"## Cover Letter Draft\n\n{draft.cover_letter}\n\n"
        f"## Recruiter Message Draft\n\n{draft.recruiter_message}\n\n"
        f"## Notes\n\n{notes}\n\n"
        f"Approval required before any external action: {'yes' if draft.approval_required else 'no'}\n"
    )


def save_agent_run(report: AgentRunReport, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "agent_run.json").write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    drafts_dir = output_dir / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    for draft in report.drafts:
        filename = f"{slugify(draft.company)}-{slugify(draft.job_title)}.md"
        (drafts_dir / filename).write_text(draft_to_markdown(draft), encoding="utf-8")


def run_job_application_agent(
    *,
    since: str,
    resume_index: list[ResumeEvidence],
    output_dir: Path,
    folder: str = "INBOX",
    top: int = 3,
    min_score: int = 70,
    limit: int = 50,
    candidate_limit: int = 250,
) -> tuple[AgentRunReport, IngestionResult]:
    goal = (
        "Find job-related emails, match them against the resume, generate application drafts, "
        "and stop before any external application action."
    )
    steps = [
        AgentRunStep("scan_email", "completed", f"Scanned QQ Mail folder {folder} since {since}."),
    ]
    ingestion = scan_qq_mail_for_jobs(
        since=since,
        folder=folder,
        limit=limit,
        candidate_limit=candidate_limit,
        resume_index=resume_index,
        output_path=output_dir / "qq_mail_jobs.json",
    )
    analyses = ingestion.analyses or []
    steps.append(
        AgentRunStep(
            "analyze_resume_fit",
            "completed",
            f"Analyzed {len(analyses)} job leads with resume evidence retrieval.",
        )
    )
    selected = select_jobs(analyses, top=top, min_score=min_score)
    steps.append(
        AgentRunStep(
            "shortlist_jobs",
            "completed",
            f"Selected {len(selected)} jobs with score >= {min_score}.",
        )
    )
    drafts = tuple(generate_application_draft(analysis) for analysis in selected)
    steps.append(
        AgentRunStep(
            "generate_drafts",
            "completed",
            f"Generated {len(drafts)} cover letter and recruiter message drafts.",
        )
    )
    steps.append(
        AgentRunStep(
            "human_approval_gate",
            "blocked",
            "External actions are blocked. Review drafts manually before applying or sending messages.",
        )
    )
    report = AgentRunReport(
        goal=goal,
        steps=tuple(steps),
        selected_jobs=selected,
        drafts=drafts,
        output_dir=str(output_dir),
        external_actions_blocked=True,
    )
    save_agent_run(report, output_dir)
    return report, ingestion


def default_agent_output_dir(private_data_dir: Path, since: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return private_data_dir / "agent_runs" / f"{since}_{timestamp}"
