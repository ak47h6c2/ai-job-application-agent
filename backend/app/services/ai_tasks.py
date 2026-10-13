from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from backend.app.services.ai_client import AIError, chat, chat_json
from backend.app.services.profile_store import normalize_profile
from backend.app.services.resume_parser import schema_prompt
from backend.app.services.storage import load_schema

MAX_RESUME_CHARS = 16000


def parse_resume_with_ai(text: str) -> dict[str, Any]:
    system = (
        "You convert a resume into structured JSON for a job-application autofill tool. "
        "Use only facts present in the resume; never invent data. Omit unknown fields.\n"
        "Output shape: {\"basic\": {fieldKey: value}, \"sections\": {sectionKey: [entry, ...]}}.\n"
        "Rules: dates are YYYY-MM (or YYYY-MM-DD for birthDate); an ongoing end date is \"present\". "
        "Enum fields use the listed values exactly. Localized fields are objects {\"zh\": ..., \"en\": ...}; "
        "fill the language(s) that appear in the resume. Keep each description as concise bullet-style text joined with newlines. "
        "Residential address (address/postcode), correspondence address (mailingAddress/mailingPostcode), "
        "and home address (homeAddress/homePostcode) are separate facts. Never copy a residence into a "
        "correspondence or home field unless the resume explicitly says they are the same. Language is a "
        "translation of the same fact, not a selector for different countries. Exam city (examCity) is separate "
        "from desired work city (expectedCity). "
        "\n\nSchema:\n" + schema_prompt()
    )
    result = chat_json(system, text[:MAX_RESUME_CHARS], max_tokens=6000)
    if not isinstance(result, dict):
        raise AIError("AI reply was not an object")
    return normalize_profile(result)


def _localized_paths(profile: dict[str, Any], target: str) -> dict[str, str]:
    """Collects localized values that exist in the other language but are empty in the target."""
    schema = load_schema()
    source = "zh" if target == "en" else "en"
    pending: dict[str, str] = {}
    localized_basic = {field["key"] for group in schema["basicGroups"] for field in group["fields"] if field.get("localized")}
    for key, value in profile["basic"].items():
        if key in localized_basic and isinstance(value, dict) and value.get(source) and not value.get(target):
            pending[f"basic.{key}"] = value[source]
    for section in schema["sections"]:
        localized = {field["key"] for field in section["fields"] if field.get("localized")}
        for position, entry in enumerate(profile["sections"].get(section["key"], [])):
            for key, value in entry.items():
                if key in localized and isinstance(value, dict) and value.get(source) and not value.get(target):
                    pending[f"sections.{section['key']}.{position}.{key}"] = value[source]
    return pending


def translate_profile(profile: dict[str, Any], target: str) -> tuple[dict[str, Any], int]:
    profile = normalize_profile(profile)
    pending = _localized_paths(profile, target)
    if not pending:
        return profile, 0
    language = "English (Australian resume style)" if target == "en" else "简体中文（国内简历风格）"
    system = (
        f"Translate resume fields into {language}. Use official English names for universities and companies when "
        "well known; otherwise translate faithfully. Keep numbers, dates and technical terms. Do not add facts. "
        "Return a JSON object mapping each input key to its translation."
    )
    translated = chat_json(system, json.dumps(pending, ensure_ascii=False), max_tokens=8000)
    if not isinstance(translated, dict):
        raise AIError("AI reply was not an object")
    applied = 0
    for path, text in translated.items():
        if path not in pending or not isinstance(text, str) or not text.strip():
            continue
        parts = path.split(".")
        if parts[0] == "basic":
            target_value = profile["basic"].get(parts[1])
        else:
            target_value = profile["sections"][parts[1]][int(parts[2])].get(parts[3])
        if isinstance(target_value, dict):
            target_value[target] = text.strip()
            applied += 1
    return profile, applied


def profile_summary(profile: dict[str, Any], lang: str, *, professional_only: bool = False) -> str:
    """Readable profile text for prompts; skips sensitive fields."""
    schema = load_schema()
    other = "en" if lang == "zh" else "zh"

    def text_of(value: Any) -> str:
        if isinstance(value, dict):
            return value.get(lang) or value.get(other) or ""
        return str(value)

    lines: list[str] = []
    professional_keys = {
        "name", "highestDegree", "firstDegree", "schoolLevel", "graduationDate", "isFreshGraduate",
        "graduateType", "hasDriverLicense", "driverLicenseType", "computerLevel", "englishLevel",
        "mandarinLevel", "jobIntent", "careerPlan", "selfEvaluation", "skills", "computerSkills", "otherSkills", "hobbies",
    }
    for group in schema["basicGroups"]:
        for field in group["fields"]:
            if field.get("sensitive") or (professional_only and field["key"] not in professional_keys):
                continue
            value = profile["basic"].get(field["key"])
            if value:
                lines.append(f"{field[lang]}: {text_of(value)}")
    for section in schema["sections"]:
        if section["key"] == "family":
            continue
        entries = profile["sections"].get(section["key"], [])
        if not entries:
            continue
        lines.append(f"\n## {section[lang]}")
        for entry in entries:
            parts = [
                f"{field[lang]}: {text_of(entry[field['key']])}" for field in section["fields"]
                if entry.get(field["key"]) and not field.get("sensitive")
                and (not professional_only or not field["key"].startswith(("reference", "referee", "salary")))
            ]
            lines.append("- " + "; ".join(parts))
    return "\n".join(lines)


def truncate_text(text: str, limit: int) -> str:
    """Cuts at the last sentence end that fits (mirrors truncateText in extension/src/engine/fillers.ts)."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = max(head.rfind(mark) for mark in ("。", "！", "？", "；", ".", "!", "?", ";", "\n"))
    if cut >= limit * 0.6:
        return head[: cut + 1].strip()
    soft = max(head.rfind(mark) for mark in ("，", "、", ","))
    if soft >= limit * 0.6:
        return head[:soft] + ("." if head[soft] == "," else "。")
    return head


def answer_question(
    profile: dict[str, Any],
    *,
    question: str,
    lang: str,
    job: dict[str, Any] | None = None,
    max_length: int | None = None,
    min_length: int | None = None,
) -> str:
    profile = normalize_profile(profile)
    language = "简体中文" if lang == "zh" else "English"
    if min_length and max_length:
        limit = f" Write between {min_length} and {max_length} characters."
    elif min_length:
        limit = f" Write at least {min_length} characters."
    else:
        limit = f" Keep it under {max_length} characters." if max_length else " Keep it concise (80-200 words or 150-400 汉字)."
    if max_length and max_length <= 60:
        limit += " This is a short form field: use a compact list of confirmed skills or facts, no introductory sentence."
    system = (
        "You help a candidate answer an open question on a job application form. Write in the first person, in "
        f"{language}. Ground every claim in the candidate profile; never invent experience, numbers or employers. "
        "Be specific and natural, no headings or markdown, no placeholders." + limit
    )
    job = job or {}
    job_text = "\n".join(
        f"{label}: {job[key]}" for key, label in (("company", "Company"), ("title", "Role"), ("description", "Job description")) if job.get(key)
    )
    user = f"Question: {question}\n\n# Job\n{job_text or '(unknown)'}\n\n# Candidate profile\n{profile_summary(profile, lang, professional_only=True)}"
    answer = chat(system, user[:20000], max_tokens=1500).strip()
    if not answer:
        raise AIError("AI 返回了空内容，请重试。")
    return truncate_text(answer, max_length) if max_length else answer


_REQUIRED_MARKS = re.compile(r"[*＊]|\(必填\)|（必填）|\(选填\)|（选填）|必填项?|选填|\(required\)|\(optional\)|required|optional", re.I)
_PROMPT_WORDS = re.compile(r"^(请输入|请选择|请填写|请上传|请录入|输入|选择|填写|please\s+(enter|select|choose|input|provide|type)|enter\s+your|select\s+your|enter|select|choose|type)\s*", re.I)


def label_core(label: str) -> str:
    """Python counterpart of normalizeLabel + labelCore in extension/src/engine/text.ts."""
    text = _REQUIRED_MARKS.sub(" ", unicodedata.normalize("NFKC", label or "").lower())
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"^[\s\d.、:：)）-]+(?=\D)", "", text)
    text = _PROMPT_WORDS.sub("", text)
    text = re.sub(r"[:：?？。.,，;；!！]+\s*$", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    core = re.sub(r"\s*[(（\[【].*?[)）\]】]\s*", " ", text)
    return re.sub(r"\s+", " ", core).strip() or text


def compatible_mapping(key: str, label: str, section: str | None, schema: dict[str, Any]) -> bool:
    """Mirrors compatibleField() in extension/src/engine/classify.ts using the schema's shared rules."""
    rules = schema["classification"]
    target, _, field_key = key.partition(".")
    generic = label_core(label) in {label_core(item) for item in rules["genericLabels"]}
    groups = {field["key"]: group["key"] for group in schema["basicGroups"] for field in group["fields"]}
    personal = target == "basic" and (groups.get(field_key) in rules["personalGroups"] or field_key in rules["personalFields"])
    if section == "other":
        return False
    # An unrecognized heading identifies no entry and may describe someone else.
    if section == "unknown":
        return target == "basic" and not generic and not personal
    if section and section != "basic":
        if target != "basic":
            return target == section
        return not generic and not personal
    # Under a basic-info heading a section field names no entry: only the highest education, a list of every
    # entry ("资格证书") or a label naming the entry ("最近工作单位") fits.
    if section == "basic" and target != "basic":
        return not generic and (
            target == "education" or key in rules["listFields"] or any(word in label_core(label) for word in rules["entryWords"])
        )
    if not section and generic:
        return key == "basic.name" and label_core(label) in {"姓名", "name"}
    return target == "basic" or not generic


def map_fields(fields: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    """Maps unrecognized form fields to profile keys. Returns [{index, key}] where key is
    'basic.<field>', '<section>.<field>', 'answer' (open question) or null."""
    schema = load_schema()
    keys = [f"basic.{field['key']} = {field['zh']}/{field['en']}" for group in schema["basicGroups"] for field in group["fields"]]
    keys += [f"{section['key']}.{field['key']} = {section['zh']} {field['zh']}/{field['en']}" for section in schema["sections"] for field in section["fields"]]
    system = (
        "You map job-application form fields to candidate profile keys. For each field return "
        "{\"index\": n, \"key\": profileKey or \"answer\" (an open question that needs a written answer) or null}. "
        "Use the section and heading to understand each field. A generic name/type/date/description "
        "belongs to its own form section (for example under 奖励/荣誉, 名称 is awards.name); "
        "never substitute a project, employment, education or another section. "
        "If the section or meaning is unknown or contradictory, return null. Do not invent facts. "
        "Return a JSON array. Valid keys:\n" + "\n".join(keys)
    )
    compact = [
        {"index": field.get("index"), "label": str(field.get("label", ""))[:200], "type": field.get("type"), "section": field.get("section"), "heading": str(field.get("heading", ""))[:100], "options": (field.get("options") or [])[:12]}
        for field in fields[:80]
    ]
    result = chat_json(system, json.dumps(compact, ensure_ascii=False), max_tokens=3000)
    if not isinstance(result, list):
        raise AIError("AI reply was not a list")
    valid = {line.split(" = ")[0] for line in keys} | {"answer"}
    inputs = {field["index"]: field for field in compact if isinstance(field["index"], int) and not isinstance(field["index"], bool)}
    mappings = []
    seen = set()
    for item in result:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        if not isinstance(index, int) or isinstance(index, bool) or index not in inputs or index in seen:
            continue
        seen.add(index)
        field = inputs[index]
        key = item.get("key")
        section = field.get("section") if isinstance(field.get("section"), str) else None
        if not isinstance(key, str) or key not in valid:
            key = None
        elif key == "answer":
            key = None if section == "other" or label_core(field["label"]) in {label_core(item) for item in schema["classification"]["genericLabels"]} else key
        elif not compatible_mapping(key, field["label"], section, schema):
            key = None
        mappings.append({"index": index, "key": key})
    return mappings
