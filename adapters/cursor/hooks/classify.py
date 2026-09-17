"""Map a Cursor hook payload to a Gurdy extract.Call shape.

Cedar already evaluates `Action::"mcp/tools_call"` with `context.resource_path`,
`context.resource_host`, and `context.tool`. Cursor's built-in tools never
become that unless something synthesizes them. This is that something: the
same pack, a new transport (Gurdy §4.2: adapt to decideCall, do not fork the
loop).

MCP tool calls are skipped here — they already go through gurdy-proxy
-stdio when wrapped, and a second decision would double-count.

Do not synthesize llm/completion from prompt hooks. Composer model HTTP
never enters gurdy-proxy; WebFetch/WebSearch are mcp/tools_call with a url.
"""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlparse

from controls import alias_for_command, destructive_shell_re, first_url, is_credential_path

# Tool names Cursor sends on preToolUse. MCP tools are "MCP:<name>".
# Task/TodoWrite/etc. are identity-only (subagentStart / session sidecar).
_SKIP_TOOLS = {
    "task",
    "todowrite",
    "readlints",
    "switchmode",
}

_PATH_TOKEN = re.compile(r"(?:^|[\s=])((?:~|/|\./)[^\s;|&`'\"<>]+)")


def classify(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Return {tool, arguments} for gurdy-proxy, or None to skip."""
    event = (payload.get("hook_event_name") or "").lower()
    tool = (payload.get("tool_name") or "").strip()
    if tool.upper().startswith("MCP:") or event in {
        "beforemcpexecution",
        "aftermcpexecution",
        "beforesubmitprompt",
        "subagentstart",
        "subagentstop",
    }:
        return None
    if tool.lower() in _SKIP_TOOLS:
        return None

    if payload.get("command") and not tool and event in {"", "beforeshellexecution"}:
        return _from_shell(str(payload["command"]))

    if event == "beforereadfile" or tool.lower() in {"read", "grep"}:
        path = _path_of(payload)
        if not path:
            return None
        return {"tool": "read_file", "arguments": {"path": _expand(path)}}

    if tool.lower() in {"delete", "deletes"}:
        path = _path_of(payload)
        return {
            "tool": "delete_file",
            "arguments": {"path": _expand(path)} if path else {},
        }

    if tool.lower() in {"write", "strreplace", "searchreplace", "editnotebook"}:
        path = _path_of(payload)
        if not path:
            return None
        return {"tool": "write_file", "arguments": {"path": _expand(path)}}

    if tool.lower() in {"webfetch", "websearch"}:
        args: dict[str, str] = {}
        url = _url_of(payload)
        if url:
            args["url"] = url
        return {"tool": tool.lower(), "arguments": args}

    if tool.lower() in {"glob", "semanticsearch"}:
        path = _path_of(payload)
        if path:
            return {"tool": "read_file", "arguments": {"path": _expand(path)}}
        return {"tool": tool.lower(), "arguments": {}}

    if event == "beforeshellexecution" or tool.lower() == "shell":
        return _from_shell(payload.get("command") or _shell_command(payload) or "")

    # Unknown native tool with a path: still a tools/call so the pack sees it.
    path = _path_of(payload)
    if path:
        name = tool.lower().replace(" ", "_") or "unknown"
        return {"tool": name, "arguments": {"path": _expand(path)}}
    url = _url_of(payload)
    if url:
        name = tool.lower().replace(" ", "_") or "unknown"
        return {"tool": name, "arguments": {"url": url}}
    return None


def _from_shell(command: str) -> dict[str, Any] | None:
    command = command.strip()
    if not command:
        return None
    paths = [_expand(p) for p in _PATH_TOKEN.findall(command)]
    if destructive_shell_re().search(command):
        args: dict[str, str] = {}
        if paths:
            args["path"] = paths[0]
        return {"tool": "rm", "arguments": args}
    alias = alias_for_command(command)
    if alias:
        args = {}
        url = first_url(command)
        if url:
            args["url"] = url
        elif paths:
            args["path"] = paths[0]
        return {"tool": str(alias["tool"]).lower(), "arguments": args}
    for path in paths:
        if is_credential_path(path):
            return {"tool": "read_file", "arguments": {"path": path}}
    return {"tool": "shell", "arguments": {"path": paths[0]} if paths else {}}


def _path_of(payload: dict[str, Any]) -> str:
    if payload.get("file_path"):
        return str(payload["file_path"])
    inp = _tool_input(payload)
    if not isinstance(inp, dict):
        return ""
    for key in (
        "path",
        "file_path",
        "filepath",
        "target",
        "directory",
        "target_directory",
    ):
        v = inp.get(key)
        if isinstance(v, str) and v and not _looks_like_url(v):
            return v
    return ""


def _url_of(payload: dict[str, Any]) -> str:
    inp = _tool_input(payload)
    if isinstance(inp, dict):
        for key in ("url", "uri", "href", "endpoint"):
            v = inp.get(key)
            if isinstance(v, str) and v:
                return v
    for key in ("url", "uri"):
        v = payload.get(key)
        if isinstance(v, str) and v:
            return v
    return ""


def _tool_input(payload: dict[str, Any]) -> Any:
    inp = payload.get("tool_input")
    if isinstance(inp, str):
        try:
            import json

            return json.loads(inp)
        except (json.JSONDecodeError, TypeError):
            return {}
    return inp


def _looks_like_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _shell_command(payload: dict[str, Any]) -> str:
    inp = _tool_input(payload)
    if isinstance(inp, dict):
        return str(inp.get("command") or "")
    if isinstance(inp, str):
        return inp
    return ""


def _expand(path: str) -> str:
    expanded = os.path.expanduser(path)
    if len(expanded) > 1:
        expanded = expanded.rstrip("/")
    return expanded
