from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DATA_DIR = PROJECT_ROOT / "data" / "private"
AGENT_RUNS_DIR = PRIVATE_DATA_DIR / "agent_runs"


app = FastAPI(title="AI Job Application Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


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
