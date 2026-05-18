from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

from backend.app.models import JobLead


URL_RE = re.compile(r"https?://\S+")
TITLE_KEYWORDS = (
    "engineer",
    "engineering",
    "developer",
    "intern",
    "graduate",
    "technology",
    "data",
    "software",
    "systems",
    "ai",
    "research",
)
CHINESE_TITLE_KEYWORDS = (
    "\u8f6f\u4ef6",
    "\u5de5\u7a0b",
    "\u5de5\u7a0b\u5e08",
    "\u5b9e\u4e60",
    "\u5b9e\u4e60\u751f",
    "\u5f00\u53d1",
    "\u6570\u636e",
    "\u7b97\u6cd5",
    "\u7814\u7a76",
)
SIGNAL_PHRASES = (
    "high skill match",
    "high experience match",
    "actively hiring",
    "use your resume",
    "internship",
    "summer internship",
)


def normalize_line(line: str) -> str:
    return " ".join(line.strip().split())


def strip_subject_prefix(line: str) -> str:
    if line.lower().startswith("subject:"):
        return normalize_line(line.split(":", 1)[1])
    return line


def has_title_keyword(line: str) -> bool:
    lowered = line.lower()
    return any(
        re.search(r"(?<![a-z0-9])ai(?![a-z0-9])", lowered)
        if keyword == "ai"
        else keyword in lowered
        for keyword in TITLE_KEYWORDS
    )


def looks_like_title(line: str) -> bool:
    if URL_RE.search(line):
        return False
    if line.lower().startswith("subject:"):
        return False
    if line.lower().startswith(("role:", "who:", "where:", "what:", "the skills:", "application deadline:")):
        return False
    if re.search(r"\bis looking for\b", line.lower()):
        return False
    if line.startswith("\u804c\u4f4d\u8ba2\u9605:") or line.startswith("\u804c\u4f4d\u8ba2\u9605\uff1a"):
        return False
    if "\u6b63\u5728\u62db\u8058" in line or "\u5728\u60a8\u9644\u8fd1\u62db\u8058\u4e86\u804c\u4f4d" in line:
        return False
    if "\u804c\u4f4d\u8d8b\u52bf" in line or re.search(r"\u672c\u5468\u5728.+?\u62db\u8058\u7684.+?\u804c\u4f4d", line):
        return False
    return (
        has_title_keyword(line)
        or any(keyword in line for keyword in CHINESE_TITLE_KEYWORDS)
    ) and len(line) <= 120


def looks_like_location(line: str) -> bool:
    lowered = line.lower()
    known_location_phrases = (
        "sydney",
        "melbourne",
        "brisbane",
        "perth",
        "australia",
        "remote",
        "\u6089\u5c3c",
        "\u58a8\u5c14\u672c",
        "\u5e03\u91cc\u65af\u73ed",
        "\u73c0\u65af",
        "\u6fb3\u6d32",
        "\u6fb3\u5927\u5229\u4e9a",
    )
    state_match = re.search(r"(?<![a-z0-9])(?:nsw|vic|qld|wa)(?![a-z0-9])", lowered)
    return any(location in lowered for location in known_location_phrases) or bool(state_match)
def normalize_location_value(line: str) -> str:
    if "\u6089\u5c3c" in line:
        return "Sydney, NSW"
    if "\u58a8\u5c14\u672c" in line:
        return "Melbourne, VIC"
    if "\u5e03\u91cc\u65af\u73ed" in line:
        return "Brisbane, QLD"
    if "\u73c0\u65af" in line:
        return "Perth, WA"
    if "\u6fb3\u6d32" in line or "\u6fb3\u5927\u5229\u4e9a" in line:
        return "Australia"
    return line


def normalize_role_title(role: str) -> str:
    compact = role.replace(" ", "")
    if "\u8f6f\u4ef6\u5de5\u7a0b" in compact and "\u5b9e\u4e60" in compact:
        return "Software Engineering Intern"
    if "\u8f6f\u4ef6" in compact and "\u5b9e\u4e60" in compact:
        return "Software Engineering Intern"
    if "\u8f6f\u4ef6\u5de5\u7a0b" in compact:
        return "Software Engineer"
    return normalize_line(role)


def infer_role_and_location(lines: list[str]) -> tuple[str, str]:
    title = ""
    location = ""
    patterns = (
        re.compile(r"\u8fc7\u53bb\u4e00\u5468\u7684(?P<title>.+?)\u804c\u4f4d\u8d8b\u52bf"),
        re.compile(r"\u672c\u5468\u5728(?P<location>.+?)\u62db\u8058\u7684(?P<title>.+?)\u804c\u4f4d"),
        re.compile(r"(?P<title>.+?)[:\uff1a]\s*.+?\u5728\u60a8\u9644\u8fd1\u62db\u8058\u4e86\u804c\u4f4d"),
    )
    for line in lines[:12]:
        line = strip_subject_prefix(line)
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            if not title and match.groupdict().get("title"):
                title = normalize_role_title(match.group("title"))
            if not location and match.groupdict().get("location"):
                location = normalize_location_value(match.group("location"))
    if not location:
        for line in lines[:24]:
            if line.lower().startswith("subject:"):
                continue
            if looks_like_location(line):
                location = normalize_location_value(line)
                break
    return title, location or "Location not stated"


def lead_exists_for_title_company(leads: list[JobLead], title: str, company: str) -> bool:
    title_key = " ".join(title.lower().split())
    company_key = " ".join(company.lower().split())
    return any(
        " ".join(lead.title.lower().split()) == title_key
        and " ".join(lead.company.lower().split()) == company_key
        for lead in leads
    )


def add_lead(
    leads: list[JobLead],
    seen: set[tuple[str, str, str]],
    *,
    title: str,
    company: str,
    location: str,
    source: str,
    url: str = "",
    signals: tuple[str, ...] = (),
    raw_excerpt: str = "",
) -> None:
    normalized_title = normalize_line(title)
    normalized_company = normalize_line(company)
    normalized_location = normalize_location_value(normalize_line(location))
    if not normalized_title or not normalized_company:
        return
    key = (normalized_title.lower(), normalized_company.lower(), normalized_location.lower())
    if key in seen:
        return
    seen.add(key)
    leads.append(
        JobLead(
            title=normalized_title,
            company=normalized_company,
            location=normalized_location,
            source=source,
            url=url,
            signals=signals,
            raw_excerpt=raw_excerpt,
        )
    )


def looks_like_company_hiring_line(line: str) -> bool:
    if URL_RE.search(line) or not line or len(line) > 80:
        return False
    blocked_exact = {
        "\u67e5\u770b\u804c\u4f4d",
        "\u62db\u8058\u60a8\u7684\u804c\u4f4d\u7684\u516c\u53f8",
        "\u5bfb\u627e\u4e0e\u60a8\u76f8\u4f3c\u7684\u4f1a\u5458\u7684\u516c\u53f8",
        "\u9876\u7ea7\u70ed\u95e8\u516c\u53f8",
    }
    blocked_markers = (
        "\u65b0\u5165\u804c\u5458\u5de5",
        "\u4f4d\u5173\u6ce8\u8005",
        "\u4eba",
    )
    return line not in blocked_exact and not any(marker in line for marker in blocked_markers)


def parse_linkedin_company_hiring_insights(
    lines: list[str],
    source: str,
    leads: list[JobLead],
    seen: set[tuple[str, str, str]],
) -> None:
    title, location = infer_role_and_location(lines)
    if not title:
        return

    section_start = next(
        (
            index
            for index, line in enumerate(lines)
            if line == "\u62db\u8058\u60a8\u7684\u804c\u4f4d\u7684\u516c\u53f8"
        ),
        None,
    )
    if section_start is None:
        return
    section_end = len(lines)
    for index in range(section_start + 1, len(lines)):
        if lines[index] in {
            "\u5bfb\u627e\u4e0e\u60a8\u76f8\u4f3c\u7684\u4f1a\u5458\u7684\u516c\u53f8",
            "\u9876\u7ea7\u70ed\u95e8\u516c\u53f8",
        }:
            section_end = index
            break

    for index in range(section_start + 1, section_end):
        company = lines[index]
        if not looks_like_company_hiring_line(company):
            continue
        block_end = min(section_end, index + 8)
        url = extract_url(lines, index, block_end)
        if not url:
            continue
        add_lead(
            leads,
            seen,
            title=title,
            company=company,
            location=location,
            source=source,
            url=url,
            signals=("\u9886\u82f1\u516c\u53f8\u62db\u8058\u8d8b\u52bf",),
            raw_excerpt="\n".join(lines[index:block_end]),
        )


def split_company_names(value: str) -> list[str]:
    parts = re.split(r"\s*(?:\u548c|\u3001|,|/| and )\s*", value)
    return [part for part in (normalize_line(part) for part in parts) if part]


def parse_linkedin_subject_hiring_alerts(
    lines: list[str],
    source: str,
    leads: list[JobLead],
    seen: set[tuple[str, str, str]],
) -> None:
    _, inferred_location = infer_role_and_location(lines)
    for index, line in enumerate(lines[:12]):
        line = strip_subject_prefix(line)
        direct_match = re.match(r"(?P<company>.+?)\u6b63\u5728\u62db\u8058(?P<title>.+)", line)
        if direct_match:
            title = normalize_role_title(direct_match.group("title"))
            company = direct_match.group("company")
            if not lead_exists_for_title_company(leads, title, company):
                add_lead(
                    leads,
                    seen,
                    title=title,
                    company=company,
                    location=inferred_location,
                    source=source,
                    url=extract_url(lines, index, min(len(lines), index + 12)),
                    signals=("\u9886\u82f1\u76f4\u63a5\u62db\u8058\u63d0\u9192",),
                    raw_excerpt="\n".join(lines[index : min(len(lines), index + 12)]),
                )
            continue

        nearby_match = re.match(
            r"(?P<title>.+?)[:\uff1a]\s*(?P<companies>.+?)\u5728\u60a8\u9644\u8fd1\u62db\u8058\u4e86\u804c\u4f4d",
            line,
        )
        if not nearby_match:
            continue
        title = normalize_role_title(nearby_match.group("title"))
        for company in split_company_names(nearby_match.group("companies")):
            if lead_exists_for_title_company(leads, title, company):
                continue
            add_lead(
                leads,
                seen,
                title=title,
                company=company,
                location=inferred_location,
                source=source,
                url=extract_url(lines, index, min(len(lines), index + 16)),
                signals=("\u9886\u82f1\u9644\u8fd1\u62db\u8058\u63d0\u9192",),
                raw_excerpt="\n".join(lines[index : min(len(lines), index + 16)]),
            )


def extract_subject(lines: list[str]) -> str:
    for line in lines[:8]:
        if line.lower().startswith("subject:"):
            return strip_subject_prefix(line)
    return ""


def infer_company_from_subject(subject: str) -> str:
    patterns = (
        r"(?P<company>[A-Z][A-Za-z0-9& .'-]+?)\s+invites you to join",
        r"(?P<company>[A-Z][A-Za-z0-9& .'-]+?)\s+is hiring",
        r"apply for (?P<company>[A-Z][A-Za-z0-9& .'-]+?)(?:'s|\u2019s)\s+internship",
        r"(?P<company>[A-Z][A-Za-z0-9& .'-]+?)(?:'s|\u2019s)\s+\d{4}",
    )
    for pattern in patterns:
        match = re.search(pattern, subject)
        if match:
            return normalize_line(match.group("company"))
    return ""


def infer_company_from_body(lines: list[str]) -> str:
    for line in lines[:12]:
        match = re.match(r"(?P<company>[A-Z][A-Za-z0-9& .'-]+?)\s+is looking for", line)
        if match:
            return normalize_line(match.group("company"))
    return ""


def infer_gradconnection_location(lines: list[str]) -> str:
    for line in lines:
        if line.lower().startswith("where:"):
            value = line.split(":", 1)[1]
            lowered = value.lower()
            if "sydney" in lowered:
                return "Sydney, NSW"
            if "melbourne" in lowered:
                return "Melbourne, VIC"
            if "brisbane" in lowered:
                return "Brisbane, QLD"
            if "perth" in lowered:
                return "Perth, WA"
            if "australia" in lowered:
                return "Australia"
            return normalize_location_value(value)
    return "Location not stated"


def parse_gradconnection_alerts(
    lines: list[str],
    source: str,
    leads: list[JobLead],
    seen: set[tuple[str, str, str]],
) -> None:
    searchable = "\n".join(lines[:30]).lower()
    if "seek grad team" not in searchable and "gradconnection" not in searchable:
        return

    subject = extract_subject(lines)
    company = infer_company_from_subject(subject) or infer_company_from_body(lines)
    if not company:
        return

    location = infer_gradconnection_location(lines)
    titles: list[tuple[str, int]] = []
    for index, line in enumerate(lines):
        if line.lower().startswith("role:"):
            title = normalize_line(line.split(":", 1)[1])
            if title:
                titles.append((title, index))

    apply_index = next((index for index, line in enumerate(lines) if line.lower() in {"apply now", "ready to apply?"}), None)
    if apply_index is not None:
        for index in range(apply_index + 1, min(len(lines), apply_index + 8)):
            line = lines[index]
            if line.lower().startswith(("good luck", "the seek grad team", "visit ")):
                break
            if looks_like_title(line):
                titles.append((line, index))

    if not titles:
        subject_title_match = re.search(r"join their (?P<title>.+?)(?:!|$)", subject)
        if subject_title_match:
            titles.append((normalize_line(subject_title_match.group("title")), 0))

    for title, index in titles:
        block_end = min(len(lines), index + 12)
        add_lead(
            leads,
            seen,
            title=title,
            company=company,
            location=location,
            source=source,
            url=extract_url(lines, index, block_end),
            signals=("SEEK Grad / GradConnection alert",),
            raw_excerpt="\n".join(lines[max(0, index - 3) : block_end]),
        )


def has_job_shape(lines: list[str], index: int) -> bool:
    if not looks_like_title(lines[index]):
        return False
    company_index = index + 1
    location_index = index + 2
    if company_index >= len(lines) or URL_RE.search(lines[company_index]):
        return False
    if location_index < len(lines) and looks_like_location(lines[location_index]):
        return True
    return location_index + 1 < len(lines) and looks_like_location(lines[location_index + 1])


def find_block_end(lines: list[str], start_index: int) -> int:
    for index in range(start_index + 1, len(lines)):
        if has_job_shape(lines, index):
            return index
    return len(lines)


def extract_url(lines: list[str], start_index: int, end_index: int) -> str:
    for line in lines[start_index:end_index]:
        match = URL_RE.search(line)
        if match and not should_skip_url(match.group(0)):
            return clean_url(match.group(0))
    return ""


def should_skip_url(url: str) -> bool:
    lowered = url.lower()
    return any(marker in lowered for marker in ("unsubscribe", "emailunsub", "/help/", "securityhelp"))


def clean_url(url: str) -> str:
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def extract_signals(lines: list[str], start_index: int, end_index: int) -> tuple[str, ...]:
    block = "\n".join(lines[start_index:end_index]).lower()
    signals = [signal for signal in SIGNAL_PHRASES if signal in block]
    return tuple(signals)


def parse_job_email(text: str, source: str = "email") -> list[JobLead]:
    """Parse common job-alert email text into job leads.

    This intentionally starts with a conservative parser for LinkedIn-style text
    emails. Later milestones can replace or augment this with LLM extraction.
    """
    lines = [normalize_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line and set(line) != {"-"}]

    leads: list[JobLead] = []
    seen: set[tuple[str, str, str]] = set()

    for index, line in enumerate(lines):
        if not looks_like_title(line):
            continue

        company = ""
        location = ""
        company_index = index + 1
        location_index = index + 2
        if company_index < len(lines):
            company = lines[company_index]
        if location_index < len(lines) and looks_like_location(lines[location_index]):
            location = lines[location_index]
        elif location_index + 1 < len(lines) and looks_like_location(lines[location_index + 1]):
            location = lines[location_index + 1]

        if not company or not location:
            continue
        if URL_RE.search(line) or URL_RE.search(company):
            continue

        block_end = find_block_end(lines, index)
        add_lead(
            leads,
            seen,
            title=line,
            company=company,
            location=location,
            source=source,
            url=extract_url(lines, index, block_end),
            signals=extract_signals(lines, index, block_end),
            raw_excerpt="\n".join(lines[index:block_end]),
        )

    parse_linkedin_company_hiring_insights(lines, source, leads, seen)
    parse_linkedin_subject_hiring_alerts(lines, source, leads, seen)
    parse_gradconnection_alerts(lines, source, leads, seen)

    return leads
