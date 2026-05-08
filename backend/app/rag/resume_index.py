from __future__ import annotations

import json
import re
from pathlib import Path

from backend.app.models import JobLead, ResumeEvidence, ResumeEvidenceMatch


SECTION_ALIASES: dict[str, str | None] = {
    "profile": None,
    "summary": None,
    "education": None,
    "technical skills": None,
    "skills": None,
    "work experience": None,
    "professional experience": None,
    "internship experience": None,
    "relevant projects": None,
    "projects": None,
    "leadership & awards": None,
    "awards": None,
    "certifications": None,
    "professional development": None,
    "个人简介": "个人简介",
    "个人总结": "个人简介",
    "求职意向": "求职意向",
    "教育经历": "教育经历",
    "教育背景": "教育经历",
    "专业技能": "专业技能",
    "技能": "专业技能",
    "技术技能": "专业技能",
    "技术栈": "专业技能",
    "工作经历": "工作经历",
    "工作经验": "工作经历",
    "实习经历": "实习经历",
    "项目经历": "项目经历",
    "项目经验": "项目经历",
    "相关项目": "项目经历",
    "校园经历": "校园经历",
    "获奖经历": "获奖经历",
    "荣誉奖项": "获奖经历",
    "证书": "证书",
    "资格证书": "证书",
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
    "大模型",
    "人工智能",
    "机器学习",
    "深度学习",
    "自然语言处理",
    "智能体",
    "检索增强",
    "数据分析",
    "数据结构",
    "算法",
    "数据库",
    "软件开发",
    "软件",
    "开发",
    "工程",
    "自动化",
    "云计算",
    "验证",
    "计算机网络",
    "测试",
    "项目",
    "实习",
)

TERM_ALIASES = {
    "software": ("软件开发", "软件", "开发"),
    "developer": ("软件开发", "开发"),
    "development": ("软件开发", "开发"),
    "engineer": ("工程", "工程能力"),
    "engineering": ("工程", "工程能力"),
    "intern": ("实习",),
    "graduate": ("毕业生岗位",),
    "testing": ("测试",),
    "test": ("测试",),
    "validation": ("验证",),
    "database": ("数据库", "sql"),
    "databases": ("数据库", "sql"),
    "algorithm": ("算法", "数据结构"),
    "algorithms": ("算法", "数据结构"),
    "cloud": ("云计算",),
    "aws": ("云计算",),
    "ai": ("人工智能", "大模型"),
    "人工智能": ("ai",),
    "大模型": ("ai", "llm"),
    "软件开发": ("software", "developer"),
    "开发": ("development", "developer"),
    "工程": ("engineer", "engineering"),
    "测试": ("testing", "test"),
    "验证": ("validation",),
    "数据库": ("database", "sql"),
    "算法": ("algorithm", "algorithms"),
    "数据结构": ("data", "structures", "algorithms"),
    "云计算": ("cloud", "aws"),
    "实习": ("intern",),
}

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
    tokens.update(term for term in IMPORTANT_TERMS if re.search(r"[\u4e00-\u9fff]", term) and term in text)
    return {
        token
        for token in tokens
        if token not in STOP_WORDS and (len(token) > 2 or re.search(r"[\u4e00-\u9fff]", token))
    }


def expand_terms(terms: set[str]) -> set[str]:
    expanded = set(terms)
    for term in terms:
        expanded.update(TERM_ALIASES.get(term, ()))
    return expanded


def extract_keywords(text: str) -> tuple[str, ...]:
    lowered = text.lower().replace("engineering", "engineer")
    found = [term for term in IMPORTANT_TERMS if term in lowered]
    return tuple(dict.fromkeys(found))


def should_skip_chunk(section: str, text: str) -> bool:
    lowered = text.lower()
    if section == "ignore":
        return True
    private_markers = ("@", "linkedin.com/in/", "phone", "+61", "邮箱", "电话", "手机号", "微信")
    return any(marker in lowered for marker in private_markers)


def normalize_section_heading(line: str) -> tuple[str, str]:
    display = re.sub(r"^[\s#>*\-•]+", "", line.strip())
    display = re.sub(r"[\s:：]+$", "", display)
    key = re.sub(r"\s+", " ", display.lower())
    return display, key


def section_for_line(line: str, current_section: str) -> str:
    display, key = normalize_section_heading(line)
    if key not in SECTION_ALIASES:
        return current_section
    return SECTION_ALIASES[key] or display


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
    return expand_terms(tokenize(" ".join([lead.title, lead.company, lead.location, lead.raw_excerpt])))


def retrieve_resume_evidence(
    lead: JobLead,
    index: list[ResumeEvidence],
    *,
    top_k: int = 3,
) -> tuple[ResumeEvidenceMatch, ...]:
    query_terms = query_terms_for_job(lead)
    matches: list[ResumeEvidenceMatch] = []
    for evidence in index:
        evidence_terms = expand_terms(tokenize(" ".join([evidence.text, " ".join(evidence.keywords)])))
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
    missing = [
        term
        for term in job_keywords
        if term not in resume_text
        and not any(alias.lower() in resume_text for alias in TERM_ALIASES.get(term, ()))
    ]
    return tuple(dict.fromkeys(missing))
