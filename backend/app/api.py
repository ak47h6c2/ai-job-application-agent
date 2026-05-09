from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.rag.resume_index import build_resume_index, extract_pdf_text, load_resume_index, save_resume_index
from backend.app.services.job_url_reader import JobUrlReadError, read_job_posting_from_url
from backend.app.services.job_agent import default_agent_output_dir, run_job_application_agent
from backend.app.services.manual_job import run_manual_job_application


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DATA_DIR = PROJECT_ROOT / "data" / "private"
AGENT_RUNS_DIR = PRIVATE_DATA_DIR / "agent_runs"
DEFAULT_RESUME_INDEX_PATH = PRIVATE_DATA_DIR / "resume_index.json"
RESUME_UPLOAD_DIR = PRIVATE_DATA_DIR / "uploads"
MAX_RESUME_BYTES = 8 * 1024 * 1024


app = FastAPI(title="AI Job Application Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class AgentRunRequest(BaseModel):
    since: str
    folder: str = Field(default="INBOX", min_length=1, max_length=80)
    top: int = Field(default=3, ge=1, le=10)
    min_score: int = Field(default=70, ge=0, le=100)
    limit: int = Field(default=50, ge=1, le=200)
    candidate_limit: int = Field(default=250, ge=1, le=1000)
    language: Literal["en", "zh"] = "en"


class ManualJobRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    company: str = Field(min_length=1, max_length=160)
    location: str = Field(default="", max_length=160)
    url: str = Field(default="", max_length=500)
    description: str = Field(min_length=20, max_length=20000)
    language: Literal["en", "zh"] = "zh"


class JobUrlPreviewRequest(BaseModel):
    url: str = Field(min_length=8, max_length=500)


def validate_since(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="since must use YYYY-MM-DD format") from exc
    if parsed > date.today():
        raise HTTPException(status_code=400, detail="since cannot be in the future")
    return parsed.isoformat()


def run_dirs() -> list[Path]:
    if not AGENT_RUNS_DIR.exists():
        return []
    return sorted(
        [path for path in AGENT_RUNS_DIR.iterdir() if (path / "agent_run.json").exists()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def resolve_run_dir(run_id: str) -> Path:
    if not run_id or run_id in {".", ".."} or any(sep in run_id for sep in ("\\", "/")):
        raise HTTPException(status_code=404, detail="Run not found")
    path = (AGENT_RUNS_DIR / run_id).resolve()
    root = AGENT_RUNS_DIR.resolve()
    if root not in path.parents and path != root:
        raise HTTPException(status_code=404, detail="Run not found")
    if not (path / "agent_run.json").exists():
        raise HTTPException(status_code=404, detail="Run not found")
    return path


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resume_index_summary() -> dict[str, Any]:
    if not DEFAULT_RESUME_INDEX_PATH.exists():
        return {"exists": False, "chunk_count": 0, "modified_at": None, "sections": [], "keywords": []}
    index = load_resume_index(DEFAULT_RESUME_INDEX_PATH)
    if not index:
        return {
            "exists": False,
            "chunk_count": 0,
            "modified_at": DEFAULT_RESUME_INDEX_PATH.stat().st_mtime,
            "sections": [],
            "keywords": [],
        }
    sections = list(dict.fromkeys(evidence.section for evidence in index))
    keywords = list(dict.fromkeys(keyword for evidence in index for keyword in evidence.keywords))
    return {
        "exists": True,
        "chunk_count": len(index),
        "modified_at": DEFAULT_RESUME_INDEX_PATH.stat().st_mtime,
        "sections": sections,
        "keywords": keywords[:12],
    }


def summarize_run(path: Path) -> dict[str, Any]:
    payload = load_json(path / "agent_run.json")
    return {
        "id": path.name,
        "goal": payload.get("goal", ""),
        "steps": payload.get("steps", []),
        "selected_job_count": len(payload.get("selected_jobs", [])),
        "draft_count": len(payload.get("drafts", [])),
        "external_actions_blocked": payload.get("external_actions_blocked", True),
        "modified_at": path.stat().st_mtime,
    }


def read_drafts(path: Path) -> list[dict[str, str]]:
    drafts_dir = path / "drafts"
    if not drafts_dir.exists():
        return []
    drafts = []
    for draft_path in sorted(drafts_dir.glob("*.md")):
        drafts.append(
            {
                "filename": draft_path.name,
                "content": draft_path.read_text(encoding="utf-8"),
            }
        )
    return drafts


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/runs")
def list_runs() -> dict[str, Any]:
    return {"runs": [summarize_run(path) for path in run_dirs()]}


@app.get("/api/resume-index")
def get_resume_index() -> dict[str, Any]:
    return resume_index_summary()


@app.post("/api/resume-index")
async def upload_resume_index(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "resume.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded resume is empty")
    if len(contents) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="Resume PDF is larger than 8 MB")

    RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = RESUME_UPLOAD_DIR / f"resume_upload_{uuid4().hex}.pdf"
    temp_path.write_bytes(contents)
    try:
        resume_text = extract_pdf_text(temp_path)
        index = build_resume_index(resume_text)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read resume PDF. Please upload a readable text-based PDF resume.",
        ) from exc
    finally:
        temp_path.unlink(missing_ok=True)

    if not index:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not read enough resume text from this PDF. "
                "If it is a scanned image resume, export it as a text-based PDF first."
            ),
        )

    save_resume_index(index, DEFAULT_RESUME_INDEX_PATH)
    return resume_index_summary()


@app.post("/api/runs")
def start_agent_run(request: AgentRunRequest) -> dict[str, Any]:
    since = validate_since(request.since)
    resume_index = load_resume_index(DEFAULT_RESUME_INDEX_PATH) if DEFAULT_RESUME_INDEX_PATH.exists() else []
    if not resume_index:
        raise HTTPException(
            status_code=400,
            detail="Resume index not found. Build it before running the agent.",
        )

    output_dir = default_agent_output_dir(PRIVATE_DATA_DIR, since)
    run_job_application_agent(
        since=since,
        resume_index=resume_index,
        output_dir=output_dir,
        folder=request.folder,
        top=request.top,
        min_score=request.min_score,
        limit=request.limit,
        candidate_limit=request.candidate_limit,
        language=request.language,
    )
    return get_run(output_dir.name)


@app.post("/api/manual-jobs")
def start_manual_job_run(request: ManualJobRequest) -> dict[str, Any]:
    resume_index = load_resume_index(DEFAULT_RESUME_INDEX_PATH) if DEFAULT_RESUME_INDEX_PATH.exists() else []
    if not resume_index:
        raise HTTPException(
            status_code=400,
            detail="Resume index not found. Build it before generating application materials.",
        )

    output_dir = default_agent_output_dir(PRIVATE_DATA_DIR, f"manual-{date.today().isoformat()}")
    run_manual_job_application(
        title=request.title,
        company=request.company,
        location=request.location,
        description=request.description,
        url=request.url,
        resume_index=resume_index,
        output_dir=output_dir,
        language=request.language,
    )
    return get_run(output_dir.name)


@app.post("/api/job-url-preview")
def preview_job_url(request: JobUrlPreviewRequest) -> dict[str, Any]:
    try:
        payload = read_job_posting_from_url(request.url).to_dict()
        payload["ok"] = True
        return payload
    except ValueError as exc:
        return {"ok": False, "detail": str(exc)}
    except JobUrlReadError as exc:
        return {
            "ok": False,
            "detail": (
                f"{exc} Some job sites require login or block automated reading. "
                "Use manual paste mode for this link."
            ),
        }


@app.get("/api/runs/latest")
def latest_run() -> dict[str, Any]:
    runs = run_dirs()
    if not runs:
        raise HTTPException(status_code=404, detail="No agent runs found")
    return get_run(runs[0].name)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    path = resolve_run_dir(run_id)
    payload = load_json(path / "agent_run.json")
    payload["id"] = path.name
    payload["output_dir"] = path.name
    payload["draft_files"] = read_drafts(path)
    return payload


def main() -> None:
    import uvicorn

    uvicorn.run("backend.app.api:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
