from __future__ import annotations

import json
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
        "fill the language(s) that appear in the resume. Keep each description as concise bullet-style text "
        "joined with newlines.\n\nSchema:\n" + schema_prompt()
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


def profile_summary(profile: dict[str, Any], lang: str) -> str:
    """Readable profile text for prompts; skips sensitive fields."""
    schema = load_schema()
    other = "en" if lang == "zh" else "zh"

    def text_of(value: Any) -> str:
        if isinstance(value, dict):
            return value.get(lang) or value.get(other) or ""
        return str(value)

    lines: list[str] = []
    for group in schema["basicGroups"]:
        for field in group["fields"]:
            if field.get("sensitive"):
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
            parts = [f"{field[lang]}: {text_of(entry[field['key']])}" for field in section["fields"] if entry.get(field["key"])]
            lines.append("- " + "; ".join(parts))
    return "\n".join(lines)


def answer_question(
    profile: dict[str, Any],
    *,
    question: str,
    lang: str,
    job: dict[str, Any] | None = None,
    max_length: int | None = None,
) -> str:
    profile = normalize_profile(profile)
    language = "简体中文" if lang == "zh" else "English"
    limit = f" Keep it under {max_length} characters." if max_length else " Keep it concise (80-200 words or 150-400 汉字)."
    system = (
        "You help a candidate answer an open question on a job application form. Write in the first person, in "
        f"{language}. Ground every claim in the candidate profile; never invent experience, numbers or employers. "
        "Be specific and natural, no headings or markdown, no placeholders." + limit
    )
    job = job or {}
    job_text = "\n".join(
        f"{label}: {job[key]}" for key, label in (("company", "Company"), ("title", "Role"), ("description", "Job description")) if job.get(key)
    )
    user = f"Question: {question}\n\n# Job\n{job_text or '(unknown)'}\n\n# Candidate profile\n{profile_summary(profile, lang)}"
    answer = chat(system, user[:20000], max_tokens=1500)
    return answer[:max_length] if max_length else answer


def map_fields(fields: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    """Maps unrecognized form fields to profile keys. Returns [{index, key}] where key is
    'basic.<field>', '<section>.<field>', 'answer' (open question) or null."""
    schema = load_schema()
    keys = [f"basic.{field['key']} = {field['zh']}/{field['en']}" for group in schema["basicGroups"] for field in group["fields"]]
    keys += [f"{section['key']}.{field['key']} = {section['zh']} {field['zh']}/{field['en']}" for section in schema["sections"] for field in section["fields"]]
    system = (
        "You map job-application form fields to candidate profile keys. For each field return "
        "{\"index\": n, \"key\": profileKey or \"answer\" (an open question that needs a written answer) or null}. "
        "Return a JSON array. Valid keys:\n" + "\n".join(keys)
    )
    compact = [
        {"index": field.get("index"), "label": str(field.get("label", ""))[:200], "type": field.get("type"), "section": field.get("section"), "options": (field.get("options") or [])[:12]}
        for field in fields[:80]
    ]
    result = chat_json(system, json.dumps(compact, ensure_ascii=False), max_tokens=3000)
    if not isinstance(result, list):
        raise AIError("AI reply was not a list")
    valid = {line.split(" = ")[0] for line in keys} | {"answer"}
    return [
        {"index": item.get("index"), "key": item.get("key") if item.get("key") in valid else None}
        for item in result
        if isinstance(item, dict)
    ]
