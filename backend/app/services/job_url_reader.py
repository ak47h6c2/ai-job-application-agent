from __future__ import annotations

import html
import ipaddress
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_JOB_PAGE_BYTES = 1_500_000
HTTP_TIMEOUT_SECONDS = 12
JOB_DESCRIPTION_MARKERS = (
    "job description",
    "about the job",
    "about the role",
    "about this role",
    "responsibilities",
    "key responsibilities",
    "duties",
    "requirements",
    "qualifications",
    "basic qualifications",
    "preferred qualifications",
    "what you'll do",
    "what you will do",
    "what you bring",
    "skills",
    "experience",
    "职位描述",
    "职位详情",
    "岗位职责",
    "工作职责",
    "任职要求",
    "任职资格",
    "岗位要求",
    "工作内容",
    "资格要求",
    "技能要求",
    "加分项",
)
JOB_ACTION_MARKERS = (
    "build",
    "develop",
    "design",
    "implement",
    "maintain",
    "support",
    "automate",
    "collaborate",
    "负责",
    "开发",
    "设计",
    "构建",
    "维护",
    "测试",
    "协作",
    "熟悉",
    "掌握",
)
TECH_OR_ROLE_MARKERS = (
    "python",
    "sql",
    "java",
    "javascript",
    "typescript",
    "react",
    "api",
    "cloud",
    "aws",
    "docker",
    "kubernetes",
    "linux",
    "database",
    "testing",
    "automation",
    "machine learning",
    "ai",
    "agent",
    "rag",
    "llm",
    "数据",
    "算法",
    "数据库",
    "测试",
    "自动化",
    "大模型",
    "人工智能",
)
PAGE_SHELL_MARKERS = (
    "sign in",
    "login",
    "save job",
    "apply now",
    "similar jobs",
    "people also viewed",
    "recommended jobs",
    "company profile",
    "privacy policy",
    "cookie policy",
    "terms of service",
    "linkedin corporation",
    "open app",
    "search jobs",
    "登录",
    "保存",
    "申请",
    "相似职位",
    "更多职位",
    "公司简介",
    "隐私政策",
    "用户协议",
    "选择语言",
)
JOB_DESCRIPTION_START_MARKERS = (
    "job description",
    "about the job",
    "about the role",
    "about this role",
    "responsibilities",
    "key responsibilities",
    "duties",
    "requirements",
    "qualifications",
    "basic qualifications",
    "preferred qualifications",
    "what you'll do",
    "what you will do",
    "what you bring",
    "职位描述",
    "职位详情",
    "岗位职责",
    "工作职责",
    "任职要求",
    "任职资格",
    "岗位要求",
    "工作内容",
    "资格要求",
)
JOB_DESCRIPTION_END_MARKERS = (
    "about the company",
    "company overview",
    "similar jobs",
    "people also viewed",
    "recommended jobs",
    "apply now",
    "save job",
    "share this job",
    "privacy policy",
    "cookie policy",
    "公司简介",
    "相似职位",
    "更多职位",
    "隐私政策",
    "用户协议",
    "选择语言",
)


class JobUrlReadError(RuntimeError):
    pass


@dataclass(frozen=True)
class JobUrlPreview:
    title: str
    company: str
    location: str
    description: str
    url: str
    source: str = "url"
    extraction_source: str = "page_text"
    quality_score: int = 0
    quality_label: str = "weak"
    quality_notes: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "description": self.description,
            "url": self.url,
            "source": self.source,
            "extraction_source": self.extraction_source,
            "quality_score": self.quality_score,
            "quality_label": self.quality_label,
            "quality_notes": list(self.quality_notes),
        }


class JobPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.text_parts: list[str] = []
        self.json_ld_scripts: list[str] = []
        self._tag_stack: list[str] = []
        self._capture_title = False
        self._capture_json_ld = False
        self._json_ld_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {key.lower(): value or "" for key, value in attrs}
        self._tag_stack.append(tag)

        if tag == "title":
            self._capture_title = True
        if tag == "script" and "ld+json" in attr_map.get("type", "").lower():
            self._capture_json_ld = True
            self._json_ld_buffer = []
        if tag == "meta":
            key = (
                attr_map.get("property")
                or attr_map.get("name")
                or attr_map.get("itemprop")
                or ""
            ).lower()
            content = attr_map.get("content", "").strip()
            if key and content:
                self.meta[key] = html.unescape(content)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._capture_title = False
        if tag == "script" and self._capture_json_ld:
            script = "".join(self._json_ld_buffer).strip()
            if script:
                self.json_ld_scripts.append(script)
            self._capture_json_ld = False
            self._json_ld_buffer = []
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        text = normalize_text(data)
        if not text:
            return
        if self._capture_json_ld:
            self._json_ld_buffer.append(data)
            return
        if self._capture_title:
            self.title_parts.append(text)
            return
        if any(tag in {"script", "style", "noscript", "svg", "header", "footer", "nav", "form", "button"} for tag in self._tag_stack):
            return
        if len(text) >= 3:
            self.text_parts.append(text)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def strip_html(value: str) -> str:
    return normalize_text(re.sub(r"<[^>]+>", " ", value))


def validate_public_http_url(url: str) -> str:
    clean_url = url.strip()
    parsed = urlparse(clean_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Invalid job URL. Use a public http or https link.")
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("Invalid job URL. Local links are not supported.")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return clean_url
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise ValueError("Invalid job URL. Private network links are not supported.")
    return clean_url


def fetch_job_page(url: str) -> str:
    request = Request(
        validate_public_http_url(url),
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                raise JobUrlReadError("The link did not return an HTML job page.")
            raw = response.read(MAX_JOB_PAGE_BYTES + 1)
    except HTTPError as exc:
        raise JobUrlReadError(f"Could not automatically read this job page. HTTP {exc.code}.") from exc
    except URLError as exc:
        raise JobUrlReadError("Could not automatically read this job page. The site may block automated access.") from exc
    if len(raw) > MAX_JOB_PAGE_BYTES:
        raise JobUrlReadError("The job page is too large to read automatically.")
    return raw.decode("utf-8", errors="replace")


def iter_json_values(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        items = [value]
        graph = value.get("@graph")
        if isinstance(graph, list):
            items.extend(item for item in graph if isinstance(item, dict))
        return items
    if isinstance(value, list):
        result: list[dict[str, Any]] = []
        for item in value:
            result.extend(iter_json_values(item))
        return result
    return []


def find_jobposting(parser: JobPageParser) -> dict[str, Any] | None:
    for script in parser.json_ld_scripts:
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue
        for item in iter_json_values(payload):
            item_type = item.get("@type")
            if isinstance(item_type, list):
                types = {str(value).lower() for value in item_type}
            else:
                types = {str(item_type).lower()}
            if "jobposting" in types:
                return item
    return None


def value_to_text(value: Any) -> str:
    if isinstance(value, str):
        return strip_html(value)
    if isinstance(value, dict):
        name = value.get("name") or value.get("text")
        if isinstance(name, str):
            return strip_html(name)
    return ""


def organization_name(value: Any) -> str:
    if isinstance(value, dict):
        return value_to_text(value.get("name")) or value_to_text(value.get("legalName"))
    if isinstance(value, list) and value:
        return organization_name(value[0])
    return value_to_text(value)


def location_name(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(filter(None, (location_name(item) for item in value[:3])))
    if not isinstance(value, dict):
        return value_to_text(value)
    address = value.get("address")
    if isinstance(address, dict):
        parts = [
            value_to_text(address.get("addressLocality")),
            value_to_text(address.get("addressRegion")),
            value_to_text(address.get("addressCountry")),
        ]
        return ", ".join(part for part in parts if part)
    return value_to_text(value.get("name"))


def compact_description(parts: list[str], *, limit: int = 6000) -> str:
    seen: set[str] = set()
    compacted: list[str] = []
    for part in parts:
        text = normalize_text(part)
        if len(text) < 20:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        compacted.append(text)
        if sum(len(item) for item in compacted) >= limit:
            break
    return "\n".join(compacted)[:limit].strip()


def trim_job_description_text(text: str) -> str:
    clean_text = normalize_text(text)
    lower_text = clean_text.lower()
    start_candidates = [
        lower_text.find(marker)
        for marker in JOB_DESCRIPTION_START_MARKERS
        if lower_text.find(marker) >= 0
    ]
    if start_candidates:
        trimmed_from_start = clean_text[min(start_candidates):].strip()
        if len(trimmed_from_start) >= 80:
            clean_text = trimmed_from_start
            lower_text = clean_text.lower()

    end_candidates = [
        lower_text.find(marker)
        for marker in JOB_DESCRIPTION_END_MARKERS
        if lower_text.find(marker) > 120
    ]
    if end_candidates:
        clean_text = clean_text[: min(end_candidates)].strip()
    return clean_text


def job_description_quality_score(*, title: str, description: str, has_jobposting: bool) -> int:
    text = normalize_text(description)
    lower_text = text.lower()
    if has_jobposting and len(text) >= 20:
        return 10

    score = 0
    if len(text) >= 120:
        score += 2
    elif len(text) >= 80:
        score += 1

    description_hits = sum(1 for marker in JOB_DESCRIPTION_MARKERS if marker in lower_text)
    action_hits = sum(1 for marker in JOB_ACTION_MARKERS if marker in lower_text)
    tech_hits = sum(1 for marker in TECH_OR_ROLE_MARKERS if marker in lower_text)
    shell_hits = sum(1 for marker in PAGE_SHELL_MARKERS if marker in lower_text)
    sentence_count = len(re.findall(r"[.!?。！？；;]\s+|[.!?。！？；;]$", text))
    word_count = len(re.findall(r"[A-Za-z0-9+#.-]+|[\u4e00-\u9fff]", text))

    score += min(description_hits, 4)
    score += min(action_hits, 2)
    if tech_hits >= 2:
        score += 1
    if tech_hits >= 5:
        score += 1
    if sentence_count >= 2:
        score += 1
    if word_count >= 45:
        score += 1

    title_tokens = [token for token in re.findall(r"[a-z0-9+#.]{3,}", title.lower()) if token not in {"job", "role"}]
    if len(text) >= 100 and any(token in lower_text for token in title_tokens[:4]):
        score += 1

    if shell_hits >= 4:
        score -= 2
    if shell_hits >= 7:
        score -= 2
    if len(re.findall(r"https?://|www\.", lower_text)) >= 3:
        score -= 1
    return score


def job_description_quality_label(score: int) -> str:
    if score >= 8:
        return "strong"
    if score >= 4:
        return "usable"
    return "weak"


def job_description_quality_notes(*, description: str, has_jobposting: bool) -> tuple[str, ...]:
    text = normalize_text(description)
    lower_text = text.lower()
    notes: list[str] = []
    if has_jobposting:
        notes.append("structured_jobposting")
    if len(text) >= 500:
        notes.append("substantial_description")
    elif len(text) < 160:
        notes.append("short_description")
    if any(marker in lower_text for marker in JOB_DESCRIPTION_MARKERS):
        notes.append("jd_section_markers")
    if sum(1 for marker in TECH_OR_ROLE_MARKERS if marker in lower_text) >= 2:
        notes.append("role_or_skill_terms")
    if sum(1 for marker in PAGE_SHELL_MARKERS if marker in lower_text) >= 4:
        notes.append("page_shell_markers")
    return tuple(dict.fromkeys(notes))


def looks_like_job_description(*, title: str, description: str, has_jobposting: bool = False) -> bool:
    return job_description_quality_score(title=title, description=description, has_jobposting=has_jobposting) >= 4


def ensure_job_description_quality(*, title: str, description: str, has_jobposting: bool = False) -> None:
    if not looks_like_job_description(title=title, description=description, has_jobposting=has_jobposting):
        raise JobUrlReadError(
            "The page text does not look like a full job description. "
            "It may be navigation, search-result, login, or recommendation text instead of the JD."
        )


def looks_like_blocked_or_login_page(
    *,
    url: str,
    title: str,
    description: str,
    has_jobposting: bool,
) -> bool:
    host = urlparse(url).netloc.lower()
    combined = f"{title} {description}".lower()
    login_markers = (
        "sign in",
        "sign-in",
        "login",
        "log in",
        "authwall",
        "captcha",
        "access denied",
        "unusual traffic",
        "verify you are human",
        "登录",
        "登陆",
        "验证码",
        "访问受限",
        "安全验证",
        "请验证",
    )
    if has_jobposting:
        return False
    if "linkedin." in host and any(marker in combined for marker in login_markers):
        return True
    if len(description) < 400 and any(marker in combined for marker in login_markers):
        return True
    return False


def looks_like_listing_or_search_page(
    *,
    url: str,
    title: str,
    description: str,
    has_jobposting: bool,
) -> bool:
    if has_jobposting:
        return False
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    combined = f"{title} {description}".lower()

    if "linkedin." in host and "/jobs/view" not in path and "/comm/jobs/view" not in path:
        if "/jobs" in path or "/company/" in path:
            return True

    listing_url_markers = (
        "/jobs/search",
        "/jobs/results",
        "/search/jobs",
        "/jobsearch",
        "/vacancies",
    )
    if any(marker in path for marker in listing_url_markers):
        return True

    listing_text_markers = (
        "jobs found",
        "job results",
        "search results",
        "recommended jobs",
        "similar jobs",
        "people also viewed",
        "view all jobs",
        "create job alert",
    )
    if any(marker in combined for marker in listing_text_markers):
        jd_hits = sum(1 for marker in JOB_DESCRIPTION_MARKERS if marker in combined)
        action_repeats = len(re.findall(r"\b(?:apply now|save job|view job)\b", combined))
        if jd_hits == 0 or action_repeats >= 3:
            return True
    return False


def preview_from_html(page_html: str, url: str) -> JobUrlPreview:
    parser = JobPageParser()
    parser.feed(page_html)
    jobposting = find_jobposting(parser) or {}
    meta = parser.meta

    title = (
        value_to_text(jobposting.get("title"))
        or meta.get("og:title", "")
        or meta.get("twitter:title", "")
        or " ".join(parser.title_parts)
    )
    company = (
        organization_name(jobposting.get("hiringOrganization"))
        or meta.get("og:site_name", "")
        or urlparse(url).netloc.replace("www.", "")
    )
    location = (
        location_name(jobposting.get("jobLocation"))
        or location_name(jobposting.get("applicantLocationRequirements"))
        or ""
    )
    description = trim_job_description_text(
        value_to_text(jobposting.get("description"))
        or compact_description([meta.get("description", ""), meta.get("og:description", ""), *parser.text_parts])
    )
    if looks_like_blocked_or_login_page(
        url=url,
        title=title,
        description=description,
        has_jobposting=bool(jobposting),
    ):
        raise JobUrlReadError("This site returned a login, captcha, or access-blocked page instead of the job post.")
    if looks_like_listing_or_search_page(
        url=url,
        title=title,
        description=description,
        has_jobposting=bool(jobposting),
    ):
        raise JobUrlReadError(
            "This page looks like a job list or search result, not a single job description. "
            "Open one specific job detail page or paste the full JD manually."
        )

    preview_title = normalize_text(title)[:160]
    preview_description = description[:12000]
    quality_score = job_description_quality_score(
        title=preview_title,
        description=preview_description,
        has_jobposting=bool(jobposting),
    )
    preview = JobUrlPreview(
        title=preview_title,
        company=normalize_text(company)[:160],
        location=normalize_text(location)[:160],
        description=preview_description,
        url=url,
        extraction_source="schema_org_jobposting" if jobposting else "page_text",
        quality_score=quality_score,
        quality_label=job_description_quality_label(quality_score),
        quality_notes=job_description_quality_notes(
            description=preview_description,
            has_jobposting=bool(jobposting),
        ),
    )
    if len(preview.title) < 2 or len(preview.company) < 1 or len(preview.description) < 20:
        raise JobUrlReadError("Could not extract enough job information from this page.")
    ensure_job_description_quality(
        title=preview.title,
        description=preview.description,
        has_jobposting=bool(jobposting),
    )
    return preview


def read_job_posting_from_url(url: str) -> JobUrlPreview:
    clean_url = validate_public_http_url(url)
    return preview_from_html(fetch_job_page(clean_url), clean_url)
