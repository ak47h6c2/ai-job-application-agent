from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from backend.app.services.storage import load_schema, private_data_dir, read_json, write_json

MAX_TEXT = 20000
MAX_ENTRIES = 30
MAX_ANSWERS = 1000


def profile_path():
    return private_data_dir() / "profile.json"


def section_keys() -> list[str]:
    return [section["key"] for section in load_schema()["sections"]]


def empty_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "basic": {},
        "sections": {key: [] for key in section_keys()},
        "answers": [],
        "settings": {"fillSensitive": False},
    }


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\x00", "")[:MAX_TEXT]


def _clean_value(value: Any) -> str | dict[str, str] | None:
    if isinstance(value, dict):
        cleaned = {lang: _clean_text(value.get(lang)) for lang in ("zh", "en") if value.get(lang) not in (None, "")}
        return cleaned or None
    if isinstance(value, (str, int, float)):
        text = _clean_text(value)
        return text if text != "" else None
    return None


def _clean_entry(entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key, value in entry.items():
        if not isinstance(key, str) or len(key) > 60:
            continue
        clean = _clean_value(value)
        if clean is not None:
            cleaned[key] = clean
    return cleaned


def normalize_question(question: str) -> str:
    return re.sub(r"[\s*:：?？。.,，、()（）\[\]【】\-_/]+", "", question.lower())[:300]


def _clean_answer(answer: Any) -> dict[str, Any] | None:
    if not isinstance(answer, dict):
        return None
    question = _clean_text(answer.get("question")).strip()[:500]
    text = _clean_text(answer.get("answer")).strip()
    if not question or not text:
        return None
    lang = answer.get("lang") if answer.get("lang") in ("zh", "en", "any") else "any"
    source = answer.get("source") if answer.get("source") in ("manual", "learned") else "manual"
    return {
        "id": _clean_text(answer.get("id"))[:60] or uuid4().hex[:12],
        "question": question,
        "answer": text,
        "lang": lang,
        "source": source,
        "updatedAt": _clean_text(answer.get("updatedAt"))[:40] or datetime.now(timezone.utc).isoformat(),
    }


def normalize_profile(payload: Any) -> dict[str, Any]:
    profile = empty_profile()
    if not isinstance(payload, dict):
        return profile
    profile["basic"] = _clean_entry(payload.get("basic"))
    sections = payload.get("sections") if isinstance(payload.get("sections"), dict) else {}
    for key in section_keys():
        entries = sections.get(key) if isinstance(sections.get(key), list) else []
        profile["sections"][key] = [entry for entry in (_clean_entry(item) for item in entries[:MAX_ENTRIES]) if entry]
    answers = payload.get("answers") if isinstance(payload.get("answers"), list) else []
    profile["answers"] = [answer for answer in (_clean_answer(item) for item in answers[:MAX_ANSWERS]) if answer]
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    profile["settings"] = {"fillSensitive": bool(settings.get("fillSensitive", False))}
    if payload.get("updatedAt"):
        profile["updatedAt"] = _clean_text(payload.get("updatedAt"))[:40]
    return profile


def load_profile() -> dict[str, Any]:
    return normalize_profile(read_json(profile_path(), {}))


def save_profile(payload: Any) -> dict[str, Any]:
    profile = normalize_profile(payload)
    profile["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_json(profile_path(), profile)
    return profile


def merge_answers(incoming: list[Any]) -> list[dict[str, Any]]:
    """Adds or replaces answers by normalized question text. Newest answer wins."""
    profile = load_profile()
    answers = profile["answers"]
    index = {normalize_question(answer["question"]): position for position, answer in enumerate(answers)}
    for raw in incoming:
        answer = _clean_answer(raw)
        if not answer:
            continue
        answer["updatedAt"] = datetime.now(timezone.utc).isoformat()
        key = normalize_question(answer["question"])
        if key in index:
            existing = answers[index[key]]
            answer["id"] = existing["id"]
            if existing.get("source") == "manual":
                answer["source"] = "manual"
            answers[index[key]] = answer
        else:
            index[key] = len(answers)
            answers.append(answer)
    profile["answers"] = answers[-MAX_ANSWERS:]
    save_profile(profile)
    return profile["answers"]


def merge_profile_draft(base: dict[str, Any], draft: dict[str, Any], *, overwrite: bool = False) -> dict[str, Any]:
    """Fills empty profile values from a parsed draft. Sections are replaced only when empty."""
    merged = normalize_profile(base)
    clean_draft = normalize_profile(draft)
    for key, value in clean_draft["basic"].items():
        current = merged["basic"].get(key)
        if overwrite or current in (None, "", {}):
            merged["basic"][key] = value
        elif isinstance(current, dict) and isinstance(value, dict):
            merged["basic"][key] = {**value, **current}
    for key, entries in clean_draft["sections"].items():
        if entries and (overwrite or not merged["sections"].get(key)):
            merged["sections"][key] = entries
    return merged
