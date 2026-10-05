from __future__ import annotations

import mimetypes
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.app.services.storage import load_schema, private_data_dir, read_json, write_json

MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
ALLOWED_SUFFIXES = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt", ".md", ".zip"}


class AttachmentError(ValueError):
    pass


def attachments_dir() -> Path:
    return private_data_dir() / "attachments"


def index_path() -> Path:
    return attachments_dir() / "index.json"


def attachment_kinds() -> set[str]:
    return {kind["key"] for kind in load_schema()["attachmentKinds"]}


def list_attachments() -> list[dict[str, Any]]:
    records = read_json(index_path(), [])
    if not isinstance(records, list):
        return []
    return [record for record in records if isinstance(record, dict) and (attachments_dir() / record.get("file", "")).is_file()]


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "_", name).strip(" .")
    return cleaned[:120] or "file"


def save_attachment(*, filename: str, content: bytes, kind: str, content_type: str | None = None) -> dict[str, Any]:
    if kind not in attachment_kinds():
        raise AttachmentError(f"Unknown attachment kind: {kind}")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise AttachmentError(f"Unsupported file type: {suffix or 'none'}")
    if not content:
        raise AttachmentError("File is empty")
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise AttachmentError("File is larger than 15 MB")

    attachment_id = uuid4().hex[:16]
    stored_name = f"{attachment_id}{suffix}"
    attachments_dir().mkdir(parents=True, exist_ok=True)
    (attachments_dir() / stored_name).write_bytes(content)
    record = {
        "id": attachment_id,
        "kind": kind,
        "name": _safe_name(filename),
        "size": len(content),
        "contentType": content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "file": stored_name,
    }
    records = list_attachments()
    records.append(record)
    write_json(index_path(), records)
    return record


def get_attachment(attachment_id: str) -> tuple[dict[str, Any], Path] | None:
    record = next((item for item in list_attachments() if item.get("id") == attachment_id), None)
    if not record:
        return None
    return record, attachments_dir() / record["file"]


def delete_attachment(attachment_id: str) -> bool:
    found = get_attachment(attachment_id)
    if not found:
        return False
    record, path = found
    path.unlink(missing_ok=True)
    write_json(index_path(), [item for item in list_attachments() if item.get("id") != record["id"]])
    return True


def public_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key != "file"}
