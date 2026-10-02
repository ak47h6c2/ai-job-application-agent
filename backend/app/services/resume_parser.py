"""Rule-based resume parsing used when no AI model is configured (and as a cheap first pass)."""
from __future__ import annotations

import io
import re
from typing import Any

from backend.app.services.storage import load_schema

CJK = re.compile(r"[一-鿿]")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CN_MOBILE = re.compile(r"(?<!\d)(?:\+?86[\s-]?)?(1[3-9]\d[\s-]?\d{4}[\s-]?\d{4})(?!\d)")
AU_MOBILE = re.compile(r"(?<!\d)((?:\+61\s?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3})(?!\d)")
GITHUB = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+", re.I)
LINKEDIN = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%-]+/?", re.I)
YEAR_MONTH = r"(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*月?"
DATE_RANGE = re.compile(
    YEAR_MONTH + r"\s*(?:[-–—~～至到]|to)+\s*(?:" + YEAR_MONTH + r"|(至今|现在|今|present|now|current))",
    re.I,
)
SCHOOL_HINT = re.compile(r"(大学|学院|学校|University|Institute|College|School|UNSW|UTS|USYD|RMIT|ANU)", re.I)
KV_LABELS = {
    "name": ["姓名"],
    "gender": ["性别"],
    "birthDate": ["出生年月", "出生日期", "生日"],
    "politicalStatus": ["政治面貌"],
    "hometown": ["籍贯"],
    "ethnicity": ["民族"],
    "currentCity": ["现居地", "现居住地", "所在城市", "现居"],
    "jobIntent": ["求职意向", "意向岗位", "应聘职位"],
    "expectedSalary": ["期望薪资", "期望月薪"],
    "wechat": ["微信"],
}


class ResumeParseError(ValueError):
    pass


def extract_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:  # pypdf raises many exception types for broken files
            raise ResumeParseError(f"Could not read PDF: {exc}") from exc
    elif lower.endswith((".txt", ".md")):
        text = content.decode("utf-8", errors="ignore")
    else:
        raise ResumeParseError("Only PDF or text resumes can be parsed")
    text = text.replace("\x00", "")
    if len(text.strip()) < 20:
        raise ResumeParseError("No readable text found. Scanned (image) PDFs are not supported yet.")
    return text


def detect_language(text: str) -> str:
    cjk = len(CJK.findall(text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return "zh" if cjk * 2 >= latin else "en"


def _enum_value(enum_key: str, raw: str) -> str:
    raw_norm = raw.strip().lower()
    for option in load_schema()["enums"].get(enum_key, []):
        if any(raw_norm == synonym.lower() or (len(synonym) > 1 and synonym.lower() in raw_norm) for synonym in option["synonyms"]):
            return option["value"]
    return ""


def _year_month(year: str, month: str) -> str:
    return f"{int(year):04d}-{int(month):02d}"


def _kv(text: str, labels: list[str]) -> str:
    for label in labels:
        match = re.search(label + r"\s*[:：]\s*([^\n|｜，,；;]{1,40})", text)
        if match:
            value = re.split(r"\s{2,}|\t", match.group(1).strip())[0]
            return value.strip()
    return ""


def _degree_in(text: str) -> str:
    for value, pattern in (
        ("phd", r"博士|ph\.?d|doctor"),
        ("master", r"硕士|研究生|master|msc|m\.eng|mit\b"),
        ("bachelor", r"本科|学士|bachelor|b\.?sc|b\.?eng|undergraduate"),
        ("associate", r"大专|专科|diploma|associate"),
    ):
        if re.search(pattern, text, re.I):
            return value
    return ""


def _education_entries(lines: list[str], lang: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for position, line in enumerate(lines):
        if not SCHOOL_HINT.search(line):
            continue
        window = " ".join(lines[position : position + 2])
        dates = DATE_RANGE.search(window)
        if not dates:
            continue
        stripped = DATE_RANGE.sub(" ", line)
        parts = [part.strip() for part in re.split(r"\s*[|｜/]\s*|\s{2,}|\t", stripped) if part.strip()]
        school = next((part for part in parts if SCHOOL_HINT.search(part)), "")
        if not school or len(school) > 60:
            continue
        degree = _degree_in(window)
        rest = [part for part in parts if part != school and not _degree_in(part) and len(part) <= 40]
        start = _year_month(dates.group(1), dates.group(2))
        end = "present" if dates.group(5) else _year_month(dates.group(3), dates.group(4))
        entry: dict[str, Any] = {"school": {lang: school}, "startDate": start, "endDate": end}
        if degree:
            entry["degree"] = degree
        if rest:
            entry["major"] = {lang: rest[0]}
        entries.append(entry)
    return entries[:6]


def parse_resume_text(text: str) -> dict[str, Any]:
    lang = detect_language(text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    basic: dict[str, Any] = {}

    email = EMAIL.search(text)
    if email:
        basic["email"] = email.group(0)
    cn_mobile = CN_MOBILE.search(text)
    au_mobile = AU_MOBILE.search(text)
    phone: dict[str, str] = {}
    if cn_mobile:
        phone["zh"] = re.sub(r"[\s-]", "", cn_mobile.group(1))
    if au_mobile:
        phone["en"] = au_mobile.group(1)
    if phone:
        basic["phone"] = phone
    if github := GITHUB.search(text):
        basic["github"] = github.group(0) if github.group(0).startswith("http") else f"https://{github.group(0)}"
    if linkedin := LINKEDIN.search(text):
        basic["linkedin"] = linkedin.group(0) if linkedin.group(0).startswith("http") else f"https://{linkedin.group(0)}"

    for key, labels in KV_LABELS.items():
        value = _kv(text, labels)
        if not value:
            continue
        if key == "gender":
            enum = _enum_value("gender", value)
            if enum:
                basic["gender"] = enum
        elif key == "politicalStatus":
            enum = _enum_value("politicalStatus", value)
            if enum:
                basic["politicalStatus"] = enum
        elif key == "birthDate":
            match = re.search(YEAR_MONTH, value)
            if match:
                basic["birthDate"] = _year_month(match.group(1), match.group(2))
        elif key in {"ethnicity", "wechat"}:
            basic[key] = value
        else:
            basic[key] = {"zh": value}

    if "name" not in basic and lines:
        first = lines[0]
        if re.fullmatch(r"[一-鿿]{2,4}", first):
            basic["name"] = {"zh": first}
        elif re.fullmatch(r"[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2}", first):
            basic["name"] = {"en": first}

    return {"basic": basic, "sections": {"education": _education_entries(lines, lang)}, "language": lang}


def schema_prompt() -> str:
    """Compact description of profile keys for AI prompts."""
    schema = load_schema()
    enums = schema["enums"]

    def describe(field: dict[str, Any]) -> str:
        text = f"{field['key']} ({field['zh']}/{field['en']}, {field['type']}"
        if field.get("enum"):
            text += ", one of: " + "|".join(option["value"] for option in enums[field["enum"]])
        if field.get("localized"):
            text += ", localized"
        return text + ")"

    lines = ["basic fields:"]
    for group in schema["basicGroups"]:
        lines.extend(f"  - {describe(field)}" for field in group["fields"] if not field.get("derived"))
    lines.append("sections (lists of entries):")
    for section in schema["sections"]:
        lines.append(f"  {section['key']} ({section['zh']}):")
        lines.extend(f"    - {describe(field)}" for field in section["fields"])
    return "\n".join(lines)
