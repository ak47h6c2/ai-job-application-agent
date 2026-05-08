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
    "大模型": "large language models",
    "人工智能": "AI",
    "机器学习": "machine learning",
    "深度学习": "deep learning",
    "自然语言处理": "natural language processing",
    "智能体": "AI agents",
    "检索增强": "retrieval-augmented generation",
    "数据分析": "data analysis",
    "数据结构": "data structures",
    "算法": "algorithms",
    "数据库": "databases",
    "软件开发": "software development",
    "软件": "software",
    "开发": "development",
    "工程": "engineering",
    "自动化": "automation",
    "云计算": "cloud computing",
    "验证": "validation",
    "计算机网络": "computer networks",
    "测试": "testing",
    "项目": "projects",
    "实习": "internship",
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

AU_MARKERS = (
    "australia",
    "australian",
    "sydney",
    "melbourne",
    "brisbane",
    "perth",
    "adelaide",
    "canberra",
    "nsw",
    "vic",
    "qld",
    "act",
    "wa",
    "澳洲",
    "澳大利亚",
    "悉尼",
    "墨尔本",
    "布里斯班",
    "珀斯",
    "阿德莱德",
    "堪培拉",
)

CHINA_MARKERS = (
    "china",
    "beijing",
    "shanghai",
    "shenzhen",
    "guangzhou",
    "hangzhou",
    "chengdu",
    "nanjing",
    "suzhou",
    "wuhan",
    "中国",
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "成都",
    "南京",
    "苏州",
    "武汉",
)

SECTION_LABELS_EN = {
    "个人简介": "profile",
    "求职意向": "career objective",
    "教育经历": "education",
    "专业技能": "technical skills",
    "工作经历": "work experience",
    "工作经验": "work experience",
    "实习经历": "internship experience",
    "项目经历": "project experience",
    "项目经验": "project experience",
    "获奖经历": "awards",
    "证书": "certifications",
}


def has_cjk(text: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def contains_marker(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def communication_language_for_job(analysis: JobApplicationAnalysis) -> Language:
    lead = analysis.scored_lead.lead
    job_text = " ".join([lead.title, lead.company, lead.location, lead.raw_excerpt])
    location_text = lead.location or lead.raw_excerpt
    if contains_marker(location_text, AU_MARKERS) or contains_marker(job_text, AU_MARKERS):
        return "en"
    if contains_marker(location_text, CHINA_MARKERS) or contains_marker(job_text, CHINA_MARKERS):
        return "zh"
    if has_cjk(lead.title) or has_cjk(lead.company):
        return "zh"
    return "en"


def display_term(term: str, language: Language = "en") -> str:
    if language == "zh":
        if term.lower() in ZH_DISPLAY_TERMS:
            return ZH_DISPLAY_TERMS[term.lower()]
        if has_cjk(term):
            return term
        return DISPLAY_TERMS.get(term.lower(), term)
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
    section = SECTION_LABELS_EN.get(best.section, best.section.lower())
    return f"resume evidence from my {section} section, including {keywords}"


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
    communication_language = communication_language_for_job(analysis)
    return ApplicationDraft(
        job_title=lead.title,
        company=lead.company,
        resume_focus=resume_focus_points(analysis, language),
        cover_letter=generate_cover_letter(analysis, communication_language),
        recruiter_message=generate_recruiter_message(analysis, communication_language),
        application_notes=application_notes(analysis, language),
        communication_language=communication_language,
        approval_required=True,
    )
