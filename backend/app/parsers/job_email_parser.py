from __future__ import annotations

import re

from backend.app.models import JobLead


URL_RE = re.compile(r"https?://\S+")
TITLE_KEYWORDS = (
    "engineer",
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


def looks_like_title(line: str) -> bool:
    if URL_RE.search(line):
        return False
    lowered = line.lower()
    return any(keyword in lowered for keyword in TITLE_KEYWORDS) and len(line) <= 120


def looks_like_location(line: str) -> bool:
    lowered = line.lower()
    known_locations = (
        "sydney",
        "melbourne",
        "brisbane",
        "perth",
        "australia",
        "remote",
        "nsw",
        "vic",
        "qld",
        "wa",
    )
    return any(location in lowered for location in known_locations) or line.isdigit()


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
        if match:
            return match.group(0)
    return ""


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

        key = (line.lower(), company.lower(), location.lower())
        if key in seen:
            continue
        seen.add(key)

        block_end = find_block_end(lines, index)
        leads.append(
            JobLead(
                title=line,
                company=company,
                location=location,
                source=source,
                url=extract_url(lines, index, block_end),
                signals=extract_signals(lines, index, block_end),
                raw_excerpt="\n".join(lines[index:block_end]),
            )
        )

    return leads
