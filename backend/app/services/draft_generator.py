from __future__ import annotations

import os
from typing import Literal

from backend.app.models import ApplicationDraft, JobApplicationAnalysis, ResumeEvidenceMatch

Language = Literal["en", "zh"]

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
    "大模型": "大模型",
    "人工智能": "人工智能",
    "机器学习": "机器学习",
    "深度学习": "深度学习",
    "自然语言处理": "自然语言处理",
    "智能体": "智能体",
    "检索增强": "检索增强",
    "数据分析": "数据分析",
    "数据结构": "数据结构",
    "算法": "算法",
    "数据库": "数据库",
    "软件开发": "软件开发",
    "自动化": "自动化",
    "云计算": "云计算",
    "测试": "测试",
    "项目": "项目",
    "实习": "实习",
}

ZH_DISPLAY_TERMS = {
    "ai": "AI",
    "aws": "AWS",
    "software": "软件开发",
    "engineer": "工程能力",
    "engineering": "工程能力",
    "intern": "实习",
    "graduate": "毕业生岗位",
    "developer": "开发能力",
    "development": "开发",
    "system": "系统",
    "systems": "系统",
    "testing": "测试",
    "validation": "验证",
    "automation": "自动化",
    "cloud": "云计算",
    "database": "数据库",
    "algorithms": "算法",
}


def display_term(term: str, language: Language = "en") -> str:
    if language == "zh":
        return ZH_DISPLAY_TERMS.get(term.lower(), DISPLAY_TERMS.get(term.lower(), term))
    return DISPLAY_TERMS.get(term.lower(), term)


def display_terms(terms: tuple[str, ...], language: Language = "en") -> str:
    separator = "、" if language == "zh" else ", "
    return separator.join(display_term(term, language) for term in terms)


def applicant_name(language: Language = "en") -> str:
    return os.getenv("APPLICANT_NAME", "申请人" if language == "zh" else "Applicant")


def applicant_summary(language: Language = "en") -> str:
    if language == "zh":
        return os.getenv(
            "APPLICANT_SUMMARY_ZH",
            "一名具备 Python、SQL、C、数据结构、数据库、计算机网络和工程验证基础的技术方向求职者",
        )
    return os.getenv(
        "APPLICANT_SUMMARY",
        "a technology student with foundations in Python, SQL, C, data structures, databases, computer networks, and engineering validation work",
    )


def evidence_sentence(matches: tuple[ResumeEvidenceMatch, ...], language: Language = "en") -> str:
    if not matches:
        if language == "zh":
            return "我的技术背景和项目经历"
        return "my current technical background and project experience"
    best = matches[0].evidence
    if language == "zh":
        keywords = display_terms(best.keywords[:4], "zh") if best.keywords else "相关技术能力"
        return f"简历中“{best.section}”部分提到的 {keywords}"
    keywords = display_terms(best.keywords[:4]) if best.keywords else "relevant technical skills"
    return f"resume evidence from my {best.section.lower()} section, including {keywords}"


def resume_focus_points(analysis: JobApplicationAnalysis, language: Language = "en") -> tuple[str, ...]:
    lead = analysis.scored_lead.lead
    if language == "zh":
        points = [
            f"在“求职意向/个人简介”里明确写成接近“{lead.title}”的方向，不要只写泛泛的 IT 技术类实习。",
            "在“项目经历”里把 Python、SQL、C、测试、数据库等与岗位相关的技术放到项目描述前半段。",
            "在“工作经历”里把测试执行、问题定位、缺陷闭环和验证报告写成可量化成果。",
        ]
        if analysis.evidence_matches:
            for match in analysis.evidence_matches[:2]:
                section = match.evidence.section
                terms = display_terms(match.matched_terms[:5], "zh")
                points.append(f"在“{section}”部分强化这些匹配点：{terms}。")
        if analysis.missing_keywords:
            points.append(f"如果你确实具备相关经历，可以补充这些关键词：{display_terms(analysis.missing_keywords[:6], 'zh')}。")
        return tuple(points)

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


def application_notes(analysis: JobApplicationAnalysis, language: Language = "en") -> tuple[str, ...]:
    if language == "zh":
        notes = [
            "不要直接投递。先核对岗位要求、简历内容和生成文字是否真实。",
            "投递前确认签证、工作权利、地点、实习/毕业生资格等硬性条件。",
        ]
        if analysis.missing_keywords:
            notes.append("需要诚实处理的能力缺口：" + display_terms(analysis.missing_keywords[:8], "zh") + "。")
        else:
            notes.append("本地简历索引暂未发现明显关键词缺口。")
        return tuple(notes)

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


def generate_cover_letter(analysis: JobApplicationAnalysis, language: Language = "en") -> str:
    lead = analysis.scored_lead.lead
    evidence = evidence_sentence(analysis.evidence_matches, language)
    missing = display_terms(analysis.missing_keywords[:4], language)
    if language == "zh":
        gap_sentence = (
            f"我也在继续补强与 {missing} 相关的项目证据，并会在申请材料中如实说明。"
            if missing
            else "我希望有机会在真实工程环境中继续学习，并为团队提供稳定、细致的执行支持。"
        )
        return (
            "您好：\n\n"
            f"我想申请 {lead.company} 的 {lead.title} 岗位。"
            f"我目前是{applicant_summary('zh')}。\n\n"
            f"这个岗位吸引我的地方在于，它和{evidence}有直接关联。"
            "我过去的学习和工作经历也包含测试执行、问题定位、技术记录和跨团队沟通，"
            "这些能力可以帮助我更快适应岗位要求。\n\n"
            f"{gap_sentence}\n\n"
            "感谢您审阅我的申请，期待进一步沟通。\n\n"
            f"此致\n{applicant_name('zh')}"
        )

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
        f"{applicant_name('en')}"
    )


def generate_recruiter_message(analysis: JobApplicationAnalysis, language: Language = "en") -> str:
    lead = analysis.scored_lead.lead
    evidence = evidence_sentence(analysis.evidence_matches, language)
    if language == "zh":
        return (
            f"您好，我想了解并申请 {lead.company} 的 {lead.title} 岗位。"
            f"我目前是{applicant_summary('zh')}，"
            f"简历中与岗位相关的主要依据是{evidence}。"
            "如果岗位仍在招聘，期待获得进一步沟通机会。"
        )
    return (
        f"Hi, I am interested in the {lead.title} role at {lead.company}. "
        f"I am {applicant_summary('en')}. "
        f"The role seems aligned with {evidence}. I would appreciate the opportunity to apply or learn more."
    )


def generate_application_draft(analysis: JobApplicationAnalysis, language: Language = "en") -> ApplicationDraft:
    lead = analysis.scored_lead.lead
    return ApplicationDraft(
        job_title=lead.title,
        company=lead.company,
        resume_focus=resume_focus_points(analysis, language),
        cover_letter=generate_cover_letter(analysis, language),
        recruiter_message=generate_recruiter_message(analysis, language),
        application_notes=application_notes(analysis, language),
        approval_required=True,
    )
