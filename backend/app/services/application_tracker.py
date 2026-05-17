from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPLICATION_STATUSES = {
    "to_review",
    "draft_ready",
    "applied",
    "waiting",
    "interview",
    "rejected",
}
NON_DRAFT_STATUSES = {"applied", "waiting", "interview", "rejected"}


def normalize_text(value: Any, *, limit: int) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\x00", "").split())[:limit]


def normalize_note(value: Any, *, limit: int = 2000) -> str:
    if value is None:
        return ""
    lines = [" ".join(line.split()) for line in str(value).replace("\x00", "").splitlines()]
    return "\n".join(line for line in lines if line)[:limit]


def application_key(*, title: str, company: str, url: str = "") -> str:
    clean_url = normalize_text(url, limit=500).lower()
    if clean_url:
        return f"url:{clean_url}"
    seed = f"{normalize_text(company, limit=160)} {normalize_text(title, limit=160)}".lower()
    slug = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", seed).strip("-")
    return f"job:{slug[:160] or 'unknown'}"


def tracker_path(private_data_dir: Path) -> Path:
    return private_data_dir / "application_tracker.json"


def load_application_records(private_data_dir: Path) -> list[dict[str, object]]:
    path = tracker_path(private_data_dir)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []
    records = payload.get("records", [])
    if not isinstance(records, list):
        return []
    normalized = [normalize_application_record(record) for record in records if isinstance(record, dict)]
    return sorted(normalized, key=lambda record: str(record.get("updated_at", "")), reverse=True)


def save_application_records(private_data_dir: Path, records: list[dict[str, object]]) -> None:
    path = tracker_path(private_data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"records": records}, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_application_record(payload: dict[str, Any]) -> dict[str, object]:
    title = normalize_text(payload.get("title"), limit=160)
    company = normalize_text(payload.get("company"), limit=160)
    url = normalize_text(payload.get("url"), limit=500)
    key = normalize_text(payload.get("key"), limit=560) or application_key(title=title, company=company, url=url)
    status = normalize_text(payload.get("status"), limit=40)
    if status not in APPLICATION_STATUSES:
        status = "to_review"
    return {
        "key": key,
        "title": title,
        "company": company,
        "url": url,
        "status": status,
        "note": normalize_note(payload.get("note")),
        "updated_at": normalize_text(payload.get("updated_at"), limit=80) or datetime.now(timezone.utc).isoformat(),
    }


def upsert_application_record(private_data_dir: Path, payload: dict[str, Any]) -> dict[str, object]:
    incoming = normalize_application_record(
        {
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    records = load_application_records(private_data_dir)
    next_records = [record for record in records if record.get("key") != incoming["key"]]
    next_records.insert(0, incoming)
    save_application_records(private_data_dir, next_records)
    return incoming


def delete_application_record(private_data_dir: Path, key: str) -> bool:
    normalized_key = normalize_text(key, limit=560)
    if not normalized_key:
        return False
    records = load_application_records(private_data_dir)
    next_records = [record for record in records if record.get("key") != normalized_key]
    if len(next_records) == len(records):
        return False
    save_application_records(private_data_dir, next_records)
    return True


def mark_application_draft_ready(private_data_dir: Path, payload: dict[str, Any]) -> dict[str, object]:
    incoming = normalize_application_record(
        {
            **payload,
            "status": "draft_ready",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    records = load_application_records(private_data_dir)
    existing = next((record for record in records if record.get("key") == incoming["key"]), None)
    if existing and existing.get("status") in NON_DRAFT_STATUSES:
        return existing

    if existing and not incoming.get("note"):
        incoming["note"] = existing.get("note", "")
    next_records = [record for record in records if record.get("key") != incoming["key"]]
    next_records.insert(0, incoming)
    save_application_records(private_data_dir, next_records)
    return incoming
