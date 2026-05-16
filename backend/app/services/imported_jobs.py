from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app.services.job_url_reader import (
    job_description_quality_label,
    job_description_quality_notes,
    job_description_quality_score,
)


def normalize_text(value: Any, *, limit: int) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).replace("\x00", "").split())
    return text[:limit]


def normalize_multiline_text(value: Any, *, limit: int) -> str:
    if value is None:
        return ""
    lines = [" ".join(line.split()) for line in str(value).replace("\x00", "").splitlines()]
    text = "\n".join(line for line in lines if line)
    return text[:limit]


def normalize_imported_job(payload: dict[str, Any]) -> dict[str, object]:
    source = normalize_text(payload.get("source"), limit=80) or "browser"
    title = normalize_text(payload.get("title"), limit=160) or "Imported job"
    company = normalize_text(payload.get("company"), limit=160) or "Unknown company"
    location = normalize_text(payload.get("location"), limit=160)
    url = normalize_text(payload.get("url"), limit=500)
    description = normalize_multiline_text(payload.get("description"), limit=20000)
    imported_at = normalize_text(payload.get("imported_at"), limit=80) or datetime.now(timezone.utc).isoformat()
    score = job_description_quality_score(
        title=title,
        description=description,
        has_jobposting=payload.get("extraction_source") == "schema_org_jobposting",
    )
    return {
        "title": title,
        "company": company,
        "location": location,
        "url": url,
        "description": description,
        "source": source,
        "extraction_source": normalize_text(payload.get("extraction_source"), limit=80) or source,
        "quality_score": score,
        "quality_label": job_description_quality_label(score),
        "quality_notes": list(
            job_description_quality_notes(
                description=description,
                has_jobposting=payload.get("extraction_source") == "schema_org_jobposting",
            )
        ),
        "imported_at": imported_at,
    }


def imported_jobs_dir(private_data_dir: Path) -> Path:
    return private_data_dir / "imported_jobs"


def latest_imported_job_path(private_data_dir: Path) -> Path:
    return imported_jobs_dir(private_data_dir) / "latest.json"


def save_imported_job(payload: dict[str, Any], private_data_dir: Path) -> dict[str, object]:
    normalized = normalize_imported_job(payload)
    target_dir = imported_jobs_dir(private_data_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    latest_path = latest_imported_job_path(private_data_dir)
    latest_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def load_latest_imported_job(private_data_dir: Path) -> dict[str, object] | None:
    path = latest_imported_job_path(private_data_dir)
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return None
    return normalize_imported_job(payload)
