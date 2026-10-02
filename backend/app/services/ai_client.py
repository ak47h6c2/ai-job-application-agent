from __future__ import annotations

import json
import re
from typing import Any

import httpx

from backend.app.services.storage import private_data_dir, read_json, write_json

PROVIDERS = {"openai", "anthropic"}
DEFAULT_SETTINGS: dict[str, Any] = {"provider": "openai", "base_url": "", "model": "", "api_key": ""}
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
REQUEST_TIMEOUT_SECONDS = 240


class AIError(RuntimeError):
    pass


class AINotConfigured(AIError):
    pass


def settings_path():
    return private_data_dir() / "settings.json"


def load_ai_settings() -> dict[str, Any]:
    payload = read_json(settings_path(), {})
    ai = payload.get("ai") if isinstance(payload, dict) else None
    settings = {**DEFAULT_SETTINGS, **(ai if isinstance(ai, dict) else {})}
    if settings["provider"] not in PROVIDERS:
        settings["provider"] = "openai"
    return settings


def save_ai_settings(update: dict[str, Any]) -> dict[str, Any]:
    settings = load_ai_settings()
    for key in ("provider", "base_url", "model"):
        if key in update and update[key] is not None:
            settings[key] = str(update[key]).strip()[:300]
    # An omitted or null key keeps the stored one; an empty string clears it.
    if update.get("api_key") is not None:
        settings["api_key"] = str(update["api_key"]).strip()[:400]
    if settings["provider"] not in PROVIDERS:
        raise AIError("Unknown provider")
    payload = read_json(settings_path(), {})
    payload = payload if isinstance(payload, dict) else {}
    payload["ai"] = settings
    write_json(settings_path(), payload)
    return settings


def public_ai_settings(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = settings or load_ai_settings()
    key = settings.get("api_key", "")
    return {
        "provider": settings["provider"],
        "base_url": settings["base_url"],
        "model": settings["model"],
        "has_key": bool(key),
        "key_hint": f"…{key[-4:]}" if len(key) >= 8 else "",
        "configured": is_configured(settings),
    }


def is_configured(settings: dict[str, Any] | None = None) -> bool:
    settings = settings or load_ai_settings()
    if not settings.get("api_key") or not settings.get("model"):
        return False
    return settings["provider"] == "anthropic" or bool(settings.get("base_url"))


def _openai_chat(settings: dict[str, Any], system: str, user: str, max_tokens: int) -> str:
    url = settings["base_url"].rstrip("/")
    if not url.endswith("/chat/completions"):
        url = f"{url}/chat/completions"
    headers = {"Authorization": f"Bearer {settings['api_key']}", "Content-Type": "application/json"}
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    body: dict[str, Any] = {"model": settings["model"], "messages": messages, "max_tokens": max_tokens, "temperature": 0.3}
    response = httpx.post(url, headers=headers, json=body, timeout=REQUEST_TIMEOUT_SECONDS)
    if response.status_code == 400 and re.search(r"max_tokens|max_completion_tokens|temperature", response.text):
        # Newer OpenAI models (reasoning / GPT-5 family) only accept max_completion_tokens and the default temperature.
        body = {"model": settings["model"], "messages": messages, "max_completion_tokens": max_tokens * 4}
        response = httpx.post(url, headers=headers, json=body, timeout=REQUEST_TIMEOUT_SECONDS)
    if response.status_code >= 400:
        raise AIError(f"AI service returned {response.status_code}: {response.text[:300]}")
    try:
        return response.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError) as exc:
        raise AIError("Unexpected AI response format") from exc


def _anthropic_chat(settings: dict[str, Any], system: str, user: str, max_tokens: int) -> str:
    url = settings["base_url"].rstrip("/") + "/v1/messages" if settings.get("base_url") else ANTHROPIC_URL
    response = httpx.post(
        url,
        headers={
            "x-api-key": settings["api_key"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": settings["model"],
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise AIError(f"AI service returned {response.status_code}: {response.text[:300]}")
    try:
        blocks = response.json()["content"]
        return "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
    except (KeyError, ValueError) as exc:
        raise AIError("Unexpected AI response format") from exc


def chat(system: str, user: str, *, max_tokens: int = 2000) -> str:
    settings = load_ai_settings()
    if not is_configured(settings):
        raise AINotConfigured("AI is not configured. Add a model and API key in Settings.")
    try:
        if settings["provider"] == "anthropic":
            return _anthropic_chat(settings, system, user, max_tokens).strip()
        return _openai_chat(settings, system, user, max_tokens).strip()
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach AI service: {exc}") from exc


def extract_json(text: str) -> Any:
    """Parses the first JSON object or array in a model reply (tolerates ```json fences)."""
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    candidate = fenced.group(1) if fenced else text
    pairs = sorted((("{", "}"), ("[", "]")), key=lambda pair: (candidate.find(pair[0]) == -1, candidate.find(pair[0])))
    for opener, closer in pairs:
        start = candidate.find(opener)
        end = candidate.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise AIError("AI reply did not contain valid JSON")


def chat_json(system: str, user: str, *, max_tokens: int = 4000) -> Any:
    return extract_json(chat(system + "\nReply with JSON only.", user, max_tokens=max_tokens))
