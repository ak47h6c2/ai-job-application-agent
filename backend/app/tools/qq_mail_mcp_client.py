from __future__ import annotations

import json
import os
import subprocess
import sys
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

    def read_message(self, *, uid: str, folder: str = "INBOX", max_chars: int = 12000) -> dict[str, Any]:
        return self.call_tool(
            "qq_mail_read",
            {
                "folder": folder,
                "uid": uid,
                "max_chars": max_chars,
            },
        )
