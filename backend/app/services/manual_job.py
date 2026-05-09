from __future__ import annotations

from pathlib import Path
from typing import Literal

from backend.app.models import AgentRunReport, AgentRunStep, JobLead, ResumeEvidence
from backend.app.sample_profile import DEFAULT_PROFILE
from backend.app.services.application_analysis import analyze_scored_lead
from backend.app.services.draft_generator import generate_application_draft
from backend.app.services.job_agent import save_agent_run
from backend.app.services.matcher import score_job_lead

Language = Literal["en", "zh"]


def run_manual_job_application(
    *,
    title: str,
    company: str,
    location: str,
    description: str,
    url: str,
    resume_index: list[ResumeEvidence],
    output_dir: Path,
    language: Language = "zh",
) -> AgentRunReport:
    lead = JobLead(
        title=title.strip(),
        company=company.strip(),
        location=location.strip() or "Not specified",
        source="manual",
        url=url.strip(),
        signals=("manual job input",),
        raw_excerpt=description.strip(),
    )
    scored = score_job_lead(lead, DEFAULT_PROFILE)
    analysis = analyze_scored_lead(scored, resume_index)
    draft = generate_application_draft(analysis, language)
    goal = (
        "根据用户手动粘贴的岗位信息，结合简历生成申请材料，并在任何对外操作前停止。"
        if language == "zh"
        else "Create application materials from a manually pasted job post and stop before any external action."
    )
    steps = (
        AgentRunStep(
            "manual_job_input",
            "completed",
            "已读取手动输入的岗位信息。"
            if language == "zh"
            else "Read the manually entered job post.",
        ),
        AgentRunStep(
            "analyze_resume_fit",
            "completed",
            "已结合简历分析岗位匹配度。"
            if language == "zh"
            else "Analyzed the job against resume evidence.",
        ),
        AgentRunStep(
            "generate_drafts",
            "completed",
            "已生成简历修改建议、求职信和招聘方消息。"
            if language == "zh"
            else "Generated resume guidance, cover letter, and recruiter message.",
        ),
        AgentRunStep(
            "human_approval_gate",
            "blocked",
            "已阻止所有对外操作。投递或发送前必须由你人工确认。"
            if language == "zh"
            else "External actions are blocked. Review drafts before applying or sending messages.",
        ),
    )
    report = AgentRunReport(
        goal=goal,
        steps=steps,
        selected_jobs=(analysis,),
        drafts=(draft,),
        output_dir=str(output_dir),
        external_actions_blocked=True,
    )
    save_agent_run(report, output_dir, language)
    return report
