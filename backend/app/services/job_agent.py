from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from backend.app.models import AgentRunReport, AgentRunStep, ApplicationDraft, JobApplicationAnalysis, ResumeEvidence
from backend.app.services.draft_generator import generate_application_draft
from backend.app.services.email_ingestion import IngestionResult, scan_qq_mail_for_jobs

Language = Literal["en", "zh"]


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


def draft_to_markdown(draft: ApplicationDraft, language: Language = "en") -> str:
    focus = "\n".join(f"- {item}" for item in draft.resume_focus)
    notes = "\n".join(f"- {item}" for item in draft.application_notes)
    if language == "zh":
        return (
            f"# {draft.job_title} - {draft.company}\n\n"
            f"## 简历修改重点\n\n{focus}\n\n"
            f"## 求职信草稿 ({draft.communication_language.upper()})\n\n{draft.cover_letter}\n\n"
            f"## 招聘方消息 ({draft.communication_language.upper()})\n\n{draft.recruiter_message}\n\n"
            f"## 投递提醒\n\n{notes}\n\n"
            f"对外发送或投递前必须人工确认：{'是' if draft.approval_required else '否'}\n"
        )
    return (
        f"# {draft.job_title} - {draft.company}\n\n"
        f"## Resume Focus\n\n{focus}\n\n"
        f"## Cover Letter Draft ({draft.communication_language.upper()})\n\n{draft.cover_letter}\n\n"
        f"## Recruiter Message Draft ({draft.communication_language.upper()})\n\n{draft.recruiter_message}\n\n"
        f"## Notes\n\n{notes}\n\n"
        f"Approval required before any external action: {'yes' if draft.approval_required else 'no'}\n"
    )


def save_agent_run(report: AgentRunReport, output_dir: Path, language: Language = "en") -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "agent_run.json").write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    drafts_dir = output_dir / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    for draft in report.drafts:
        filename = f"{slugify(draft.company)}-{slugify(draft.job_title)}.md"
        (drafts_dir / filename).write_text(draft_to_markdown(draft, language), encoding="utf-8")


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
    language: Language = "en",
) -> tuple[AgentRunReport, IngestionResult]:
    goal = (
        "从邮件中找出求职相关内容，结合简历判断匹配度，生成申请材料，并在任何对外操作前停止。"
        if language == "zh"
        else (
            "Find job-related emails, match them against the resume, generate application drafts, "
            "and stop before any external application action."
        )
    )
    steps = [
        AgentRunStep(
            "scan_email",
            "completed",
            f"已读取 QQ 邮箱 {folder} 中 {since} 以来的邮件。"
            if language == "zh"
            else f"Scanned QQ Mail folder {folder} since {since}.",
        ),
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
            f"已结合简历分析 {len(analyses)} 条职位线索。"
            if language == "zh"
            else f"Analyzed {len(analyses)} job leads with resume evidence retrieval.",
        )
    )
    selected = select_jobs(analyses, top=top, min_score=min_score)
    steps.append(
        AgentRunStep(
            "shortlist_jobs",
            "completed",
            f"筛选出 {len(selected)} 个匹配度不低于 {min_score} 的职位。"
            if language == "zh"
            else f"Selected {len(selected)} jobs with score >= {min_score}.",
        )
    )
    drafts = tuple(generate_application_draft(analysis, language) for analysis in selected)
    steps.append(
        AgentRunStep(
            "generate_drafts",
            "completed",
            f"已生成 {len(drafts)} 份求职信和招聘方消息草稿。"
            if language == "zh"
            else f"Generated {len(drafts)} cover letter and recruiter message drafts.",
        )
    )
    steps.append(
        AgentRunStep(
            "human_approval_gate",
            "blocked",
            "已阻止所有对外操作。投递或发送前必须由你人工确认。"
            if language == "zh"
            else "External actions are blocked. Review drafts manually before applying or sending messages.",
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
    save_agent_run(report, output_dir, language)
    return report, ingestion


def default_agent_output_dir(private_data_dir: Path, since: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return private_data_dir / "agent_runs" / f"{since}_{timestamp}"
