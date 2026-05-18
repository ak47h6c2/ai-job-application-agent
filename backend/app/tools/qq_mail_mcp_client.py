from __future__ import annotations

import json
import os
import subprocess
import sys
import importlib.util
from pathlib import Path
from typing import Any


class QQMailToolError(RuntimeError):
    """Raised when the QQ Mail MCP tool reports an error."""


def default_mcp_script_path() -> Path:
    return Path.home() / "plugins" / "qq-mail" / "scripts" / "qq_mail_mcp.py"


def user_environment_on_windows() -> dict[str, str]:
    if os.name != "nt":
        return {}
    try:
        import winreg
    except ImportError:
        return {}

    values: dict[str, str] = {}
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            index = 0
            while True:
                try:
                    name, value, _value_type = winreg.EnumValue(key, index)
                except OSError:
                    break
                if isinstance(value, str):
                    values[name] = value
                index += 1
    except OSError:
        return {}
    return values


def build_tool_environment() -> dict[str, str]:
    env = os.environ.copy()
    for key, value in user_environment_on_windows().items():
        env.setdefault(key, value)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


class QQMailMCPClient:
    """Small JSON-RPC client for the local QQ Mail MCP server.

    The project treats QQ Mail as an external tool. This keeps email access
    isolated from the rest of the application and makes the boundary explicit.
    """

    def __init__(self, script_path: str | Path | None = None) -> None:
        configured_path = script_path or os.getenv("QQ_MAIL_MCP_SCRIPT")
        self.script_path = Path(configured_path) if configured_path else default_mcp_script_path()

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.script_path.exists():
            raise QQMailToolError(
                "QQ Mail MCP script was not found. Set QQ_MAIL_MCP_SCRIPT or install the qq-mail plugin."
            )

        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments or {},
            },
        }
        process = subprocess.run(
            [sys.executable, str(self.script_path)],
            input=json.dumps(request) + "\n",
            text=True,
            encoding="utf-8",
            capture_output=True,
            env=build_tool_environment(),
            check=False,
        )
        if process.returncode != 0:
            raise QQMailToolError(process.stderr.strip() or "QQ Mail MCP process failed.")

        response_lines = [line for line in process.stdout.splitlines() if line.strip()]
        if not response_lines:
            raise QQMailToolError("QQ Mail MCP returned no response.")

        response = json.loads(response_lines[-1])
        if "error" in response:
            raise QQMailToolError(response["error"].get("message", "QQ Mail MCP returned an error."))

        result = response.get("result", {})
        content = result.get("content", [])
        if result.get("isError"):
            message = content[0].get("text", "") if content else "QQ Mail tool failed."
            try:
                payload = json.loads(message)
                message = payload.get("error", message)
            except json.JSONDecodeError:
                pass
            raise QQMailToolError(message)

        if not content:
            return {}
        text = content[0].get("text", "{}")
        return json.loads(text)

    def list_messages(
        self,
        *,
        folder: str = "INBOX",
        since: str | None = None,
        limit: int = 50,
        candidate_limit: int = 250,
    ) -> list[dict[str, Any]]:
        arguments: dict[str, Any] = {
            "folder": folder,
            "limit": limit,
            "candidate_limit": candidate_limit,
        }
        if since:
            arguments["since"] = since
        payload = self.call_tool("qq_mail_list", arguments)
        return list(payload.get("messages", []))

    def search_messages(
        self,
        *,
        folder: str = "INBOX",
        since: str | None = None,
        limit: int = 50,
        candidate_limit: int = 250,
        from_contains: str = "",
        subject_contains: str = "",
    ) -> list[dict[str, Any]]:
        arguments: dict[str, Any] = {
            "folder": folder,
            "limit": limit,
            "candidate_limit": candidate_limit,
        }
        if since:
            arguments["since"] = since
        if from_contains:
            arguments["from"] = from_contains
        if subject_contains:
            arguments["subject"] = subject_contains
        payload = self.call_tool("qq_mail_list", arguments)
        return list(payload.get("messages", []))

    def load_mcp_module(self) -> Any:
        os.environ.update(build_tool_environment())
        spec = importlib.util.spec_from_file_location("qq_mail_mcp_local", self.script_path)
        if spec is None or spec.loader is None:
            raise QQMailToolError("Could not load QQ Mail MCP module.")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def list_job_scan_pool(
        self,
        *,
        folder: str = "INBOX",
        since: str | None = None,
        limit: int = 50,
        candidate_limit: int = 250,
        from_terms: tuple[str, ...] = (),
        subject_terms: tuple[str, ...] = (),
    ) -> list[dict[str, Any]]:
        """Return recent messages plus targeted platform hits in one IMAP pass."""
        if not self.script_path.exists():
            raise QQMailToolError(
                "QQ Mail MCP script was not found. Set QQ_MAIL_MCP_SCRIPT or install the qq-mail plugin."
            )

        qq = self.load_mcp_module()
        criteria: list[str] = ["ALL"]
        if since:
            criteria.extend(["SINCE", qq.imap_date(since)])
        pool_limit = min(max(candidate_limit, limit), 1000)
        recent_limit = min(max(limit, 1), 200)
        from_needles = tuple(term.lower() for term in from_terms if term)
        subject_needles = tuple(term.lower() for term in subject_terms if term)

        conn = qq.open_imap(folder=folder, readonly=True)
        try:
            status, data = conn.uid("search", None, *criteria)
            if status != "OK":
                raise QQMailToolError("IMAP search failed.")
            uids = (data[0] or b"").split()
            base_uids = [uid.decode("ascii", "ignore") for uid in reversed(uids[-pool_limit:])]
            targeted_uids: set[str] = set()
            search_base = list(criteria)
            for term in from_terms:
                if not term or not term.isascii():
                    continue
                try:
                    status, data = conn.uid("search", None, *search_base, "FROM", term)
                except Exception:
                    continue
                if status == "OK":
                    targeted_uids.update(uid.decode("ascii", "ignore") for uid in (data[0] or b"").split()[-200:])

            ordered_uids = list(base_uids)
            for uid in sorted(targeted_uids, key=lambda value: int(value) if value.isdigit() else 0, reverse=True):
                if uid not in ordered_uids:
                    ordered_uids.append(uid)

            messages: list[dict[str, Any]] = []
            seen: set[str] = set()
            recent_remaining = recent_limit
            for uid in ordered_uids:
                status, fetched = conn.uid("fetch", uid, "(BODY.PEEK[HEADER] FLAGS)")
                if status != "OK":
                    continue
                header_bytes = b""
                for item in fetched or []:
                    if isinstance(item, tuple) and isinstance(item[1], bytes):
                        header_bytes = item[1]
                        break
                if not header_bytes:
                    continue
                summary = qq.message_summary_from_header(uid, header_bytes, qq.get_flags_from_fetch(fetched))
                sender = str(summary.get("from", "")).lower()
                subject = str(summary.get("subject", "")).lower()
                targeted = any(term in sender for term in from_needles) or any(
                    term in subject for term in subject_needles
                )
                if recent_remaining <= 0 and not targeted and uid not in targeted_uids:
                    continue
                if uid in seen:
                    continue
                seen.add(uid)
                summary["folder"] = folder
                messages.append(summary)
                if recent_remaining > 0:
                    recent_remaining -= 1
            return messages
        finally:
            qq.close_imap(conn)

    def read_message(self, *, uid: str, folder: str = "INBOX", max_chars: int = 12000) -> dict[str, Any]:
        return self.call_tool(
            "qq_mail_read",
            {
                "folder": folder,
                "uid": uid,
                "max_chars": max_chars,
            },
        )

    def read_messages_bulk(
        self,
        *,
        uids: list[str],
        folder: str = "INBOX",
        max_chars: int = 12000,
    ) -> dict[str, dict[str, Any]]:
        if not uids:
            return {}
        if not self.script_path.exists():
            raise QQMailToolError(
                "QQ Mail MCP script was not found. Set QQ_MAIL_MCP_SCRIPT or install the qq-mail plugin."
            )

        qq = self.load_mcp_module()
        max_chars = min(max(int(max_chars or 12000), 1000), 100000)
        results: dict[str, dict[str, Any]] = {}
        conn = qq.open_imap(folder=folder, readonly=True)
        try:
            for uid in uids:
                try:
                    raw_message = qq.uid_fetch(conn, uid, "(BODY.PEEK[])")
                    message = qq.BytesParser(policy=qq.policy.default).parsebytes(raw_message)
                    plain, _html, attachments = qq.extract_body(message)
                except Exception:
                    continue
                results[uid] = {
                    "folder": folder,
                    "uid": uid,
                    "subject": qq.header_value(message, "subject"),
                    "from": qq.header_value(message, "from"),
                    "to": qq.header_value(message, "to"),
                    "cc": qq.header_value(message, "cc"),
                    "date": qq.header_value(message, "date"),
                    "message_id": qq.header_value(message, "message-id"),
                    "references": qq.header_value(message, "references"),
                    "in_reply_to": qq.header_value(message, "in-reply-to"),
                    "text": plain[:max_chars],
                    "text_truncated": len(plain) > max_chars,
                    "attachments": attachments,
                }
            return results
        finally:
            qq.close_imap(conn)
