from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.app.services import ai_client, ai_tasks
from backend.app.services.application_tracker import (
    delete_application_record,
    load_application_records,
    upsert_application_record,
)
from backend.app.services.attachments import (
    AttachmentError,
    delete_attachment,
    get_attachment,
    list_attachments,
    public_record,
    save_attachment,
)
from backend.app.services.job_url_reader import JobUrlReadError, read_job_posting_from_url
from backend.app.services.profile_store import apply_capture, load_profile, merge_answers, merge_profile_draft, save_profile
from backend.app.services.resume_parser import ResumeParseError, extract_text, parse_resume_text
from backend.app.services.storage import load_schema, private_data_dir

API_VERSION = "3.0"

app = FastAPI(title="AI Job Application Agent API", version=API_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    # The browser extension talks to this API from its own origin.
    allow_origin_regex=r"^(chrome|moz)-extension://[a-z0-9-]+$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


class ProfileRequest(BaseModel):
    profile: dict[str, Any]


class AnswersRequest(BaseModel):
    answers: list[dict[str, Any]] = Field(max_length=200)


class CaptureValue(BaseModel):
    key: str = Field(min_length=1, max_length=60)
    value: str = Field(max_length=20000)
    lang: Literal["zh", "en"] = "zh"


class CaptureEntry(BaseModel):
    section: str = Field(min_length=1, max_length=40)
    index: int | None = Field(default=None, ge=0, le=200)
    values: list[CaptureValue] = Field(max_length=60)


class CaptureAnswer(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(max_length=20000)
    lang: Literal["zh", "en", "any"] = "any"


class CaptureRequest(BaseModel):
    basic: list[CaptureValue] = Field(default_factory=list, max_length=200)
    entries: list[CaptureEntry] = Field(default_factory=list, max_length=100)
    answers: list[CaptureAnswer] = Field(default_factory=list, max_length=200)


class ApplicationRecordRequest(BaseModel):
    title: str = Field(default="", max_length=160)
    company: str = Field(default="", max_length=160)
    url: str = Field(default="", max_length=500)
    status: str = Field(default="applied", max_length=40)
    source: str = Field(default="", max_length=80)
    applied_at: str = Field(default="", max_length=20)
    note: str = Field(default="", max_length=2000)
    next_action_at: str | None = Field(default=None, max_length=20)
    key: str = Field(default="", max_length=560)


class ApplicationDeleteRequest(BaseModel):
    key: str = Field(min_length=1, max_length=560)


class AISettingsRequest(BaseModel):
    provider: Literal["openai", "anthropic"] = "openai"
    base_url: str = Field(default="", max_length=300)
    model: str = Field(default="", max_length=120)
    api_key: str | None = Field(default=None, max_length=400)


class TranslateRequest(BaseModel):
    target: Literal["zh", "en"] = "en"
    profile: dict[str, Any] | None = None


class JobContext(BaseModel):
    title: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    url: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=12000)


class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    lang: Literal["zh", "en"] = "zh"
    job: JobContext | None = None
    max_length: int | None = Field(default=None, ge=20, le=5000)


class MapFieldsRequest(BaseModel):
    fields: list[dict[str, Any]] = Field(max_length=120)
    lang: Literal["zh", "en"] = "zh"


class JobUrlPreviewRequest(BaseModel):
    url: str = Field(min_length=8, max_length=500)


def ai_error(exc: ai_client.AIError) -> HTTPException:
    status = 412 if isinstance(exc, ai_client.AINotConfigured) else 502
    return HTTPException(status_code=status, detail=str(exc))


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "version": API_VERSION, "ai": ai_client.is_configured()}


@app.get("/api/schema")
def get_schema() -> dict[str, Any]:
    return load_schema()


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    return {"profile": load_profile()}


@app.put("/api/profile")
def put_profile(request: ProfileRequest) -> dict[str, Any]:
    return {"profile": save_profile(request.profile)}


@app.post("/api/profile/answers")
def post_answers(request: AnswersRequest) -> dict[str, Any]:
    return {"answers": merge_answers(request.answers)}


@app.post("/api/profile/capture")
def post_capture(request: CaptureRequest) -> dict[str, Any]:
    """Saves values the user typed into an application form (read by the extension) into the profile."""
    profile, applied = apply_capture(request.model_dump())
    return {"profile": profile, "applied": applied}


@app.get("/api/attachments")
def get_attachments() -> dict[str, Any]:
    return {"attachments": [public_record(record) for record in list_attachments()]}


@app.post("/api/attachments")
async def post_attachment(file: UploadFile = File(...), kind: str = Form(...)) -> dict[str, Any]:
    content = await file.read()
    try:
        record = save_attachment(filename=file.filename or "file", content=content, kind=kind, content_type=file.content_type)
    except AttachmentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"attachment": public_record(record)}


@app.get("/api/attachments/{attachment_id}/file")
def get_attachment_file(attachment_id: str) -> FileResponse:
    found = get_attachment(attachment_id)
    if not found:
        raise HTTPException(status_code=404, detail="Attachment not found")
    record, path = found
    return FileResponse(path, media_type=record["contentType"], filename=record["name"])


@app.delete("/api/attachments/{attachment_id}")
def remove_attachment(attachment_id: str) -> dict[str, Any]:
    if not delete_attachment(attachment_id):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"deleted": True}


@app.post("/api/resume/parse")
async def parse_resume(
    file: UploadFile | None = File(default=None),
    attachment_id: str = Form(default=""),
    use_ai: bool = Form(default=True),
) -> dict[str, Any]:
    """Parses a resume into a profile draft merged onto the saved profile (not saved)."""
    if file is not None:
        filename, content = file.filename or "resume.pdf", await file.read()
    elif attachment_id:
        found = get_attachment(attachment_id)
        if not found:
            raise HTTPException(status_code=404, detail="Attachment not found")
        record, path = found
        filename, content = record["name"], path.read_bytes()
    else:
        raise HTTPException(status_code=400, detail="Upload a resume file or choose an attachment")

    try:
        text = extract_text(filename, content)
    except ResumeParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    method = "rules"
    warning = ""
    draft = parse_resume_text(text)
    if use_ai and ai_client.is_configured():
        try:
            draft = ai_tasks.parse_resume_with_ai(text)
            method = "ai"
        except ai_client.AIError as exc:
            warning = str(exc)
    merged = merge_profile_draft(load_profile(), draft)
    return {"profile": merged, "method": method, "warning": warning, "text_chars": len(text)}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return {"ai": ai_client.public_ai_settings(), "data_dir": str(private_data_dir())}


@app.put("/api/settings")
def put_settings(request: AISettingsRequest) -> dict[str, Any]:
    try:
        settings = ai_client.save_ai_settings(request.model_dump())
    except ai_client.AIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ai": ai_client.public_ai_settings(settings)}


@app.post("/api/ai/test")
def test_ai() -> dict[str, Any]:
    try:
        reply = ai_client.chat("Reply with the single word OK.", "ping", max_tokens=10)
    except ai_client.AIError as exc:
        raise ai_error(exc) from exc
    return {"ok": True, "reply": reply[:40]}


@app.post("/api/ai/translate")
def translate(request: TranslateRequest) -> dict[str, Any]:
    try:
        profile, count = ai_tasks.translate_profile(request.profile or load_profile(), request.target)
    except ai_client.AIError as exc:
        raise ai_error(exc) from exc
    return {"profile": profile, "translated": count}


@app.post("/api/ai/answer")
def answer(request: AnswerRequest) -> dict[str, Any]:
    try:
        text = ai_tasks.answer_question(
            load_profile(),
            question=request.question,
            lang=request.lang,
            job=request.job.model_dump() if request.job else None,
            max_length=request.max_length,
        )
    except ai_client.AIError as exc:
        raise ai_error(exc) from exc
    return {"answer": text}


@app.post("/api/ai/map-fields")
def map_fields(request: MapFieldsRequest) -> dict[str, Any]:
    try:
        mappings = ai_tasks.map_fields(request.fields, request.lang)
    except ai_client.AIError as exc:
        raise ai_error(exc) from exc
    return {"mappings": mappings}


@app.get("/api/applications")
def list_applications() -> dict[str, Any]:
    return {"records": load_application_records(private_data_dir())}


@app.post("/api/applications")
def save_application(request: ApplicationRecordRequest) -> dict[str, Any]:
    payload = request.model_dump(exclude_unset=True)
    payload.setdefault("status", "applied")
    return {"record": upsert_application_record(private_data_dir(), payload)}


@app.post("/api/applications/delete")
def delete_application(request: ApplicationDeleteRequest) -> dict[str, Any]:
    deleted = delete_application_record(private_data_dir(), request.key)
    return {"deleted": deleted, "records": load_application_records(private_data_dir())}


@app.post("/api/job-url-preview")
def preview_job_url(request: JobUrlPreviewRequest) -> dict[str, Any]:
    try:
        payload = read_job_posting_from_url(request.url).to_dict()
    except (ValueError, JobUrlReadError) as exc:
        return {"ok": False, "detail": str(exc)}
    payload["ok"] = True
    return payload


def main() -> None:
    import uvicorn

    uvicorn.run("backend.app.api:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
