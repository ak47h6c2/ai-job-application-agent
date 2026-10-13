from __future__ import annotations

import json
import os
import time
from functools import wraps
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock
from typing import Callable, ParamSpec, TypeVar
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = PROJECT_ROOT / "shared" / "profile-schema.json"
_DATA_LOCK = RLock()
_P = ParamSpec("_P")
_R = TypeVar("_R")
# Windows refuses to open or replace a file another handle holds (antivirus, sync tools).
_LOCK_RETRIES = 8
_LOCK_RETRY_SECONDS = 0.05


class DataFileError(RuntimeError):
    """A data file exists but cannot be read. Callers must stop instead of overwriting it with defaults."""


def synchronized(function: Callable[_P, _R]) -> Callable[_P, _R]:
    """Serializes local read-modify-write operations in the single API process."""
    @wraps(function)
    def wrapped(*args: _P.args, **kwargs: _P.kwargs) -> _R:
        with _DATA_LOCK:
            return function(*args, **kwargs)
    return wrapped


def private_data_dir() -> Path:
    override = os.environ.get("JOB_AGENT_DATA_DIR")
    return Path(override) if override else PROJECT_ROOT / "data" / "private"


def _retry_locked(operation: Callable[[], _R]) -> _R:
    for attempt in range(_LOCK_RETRIES):
        try:
            return operation()
        except PermissionError:
            if attempt == _LOCK_RETRIES - 1:
                raise
            time.sleep(_LOCK_RETRY_SECONDS * (attempt + 1))
    raise AssertionError("unreachable")


@synchronized
def read_json(path: Path, default: Any) -> Any:
    """Returns ``default`` only when the file does not exist; an unreadable file raises DataFileError."""
    if not path.exists():
        return default
    try:
        return json.loads(_retry_locked(lambda: path.read_text(encoding="utf-8-sig")))
    except (OSError, json.JSONDecodeError) as exc:
        raise DataFileError(
            f"无法读取数据文件 {path.name}（{exc}）。为避免覆盖原有内容，本次操作已停止；请检查或恢复该文件后重试。"
        ) from exc


@synchronized
def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as stream:
        temp = Path(stream.name)
        try:
            stream.write(json.dumps(payload, ensure_ascii=False, indent=2))
        except BaseException:
            stream.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        _retry_locked(lambda: temp.replace(path))
    finally:
        temp.unlink(missing_ok=True)


_schema_cache: dict[str, Any] | None = None


def load_schema() -> dict[str, Any]:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache
