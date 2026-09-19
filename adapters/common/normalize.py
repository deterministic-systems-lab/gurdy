"""Map a host-native hook payload onto the shape classify.py already understands.

Cursor events stay as they are. Claude Code and Codex send tool_name +
tool_input. Antigravity sends camelCase toolCall.{name,args}. One Cedar
pack; do not invent a second action name for the same forbid.
"""

from __future__ import annotations

import re
from typing import Any

_PATCH_FILE = re.compile(
    r"(?m)^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$"
)

_AGY_TOOLS = {
    "view_file": ("Read", "beforeReadFile"),
    "write_to_file": ("Write", ""),
    "replace_file_content": ("Write", ""),
    "multi_replace_file_content": ("Write", ""),
    "grep_search": ("Grep", ""),
    "find_by_name": ("Glob", ""),
    "list_dir": ("Glob", ""),
    "run_command": ("Shell", "beforeShellExecution"),
    "search_web": ("WebSearch", ""),
    "read_url_content": ("WebFetch", ""),
}

_AGY_ARG = (
    ("AbsolutePath", "file_path"),
    ("TargetFile", "file_path"),
    ("SearchPath", "path"),
    ("SearchDirectory", "target_directory"),
    ("DirectoryPath", "target_directory"),
    ("Url", "url"),
    ("CommandLine", "command"),
)


def normalize(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    out = dict(payload)

    if payload.get("conversationId") and not payload.get("conversation_id"):
        out["conversation_id"] = payload["conversationId"]
    if payload.get("modelName") and not payload.get("model"):
        out["model"] = payload["modelName"]

    tc = payload.get("toolCall") or payload.get("tool_call")
    if isinstance(tc, dict) and tc.get("name"):
        out.setdefault("tool_name", str(tc["name"]))
        args = tc.get("args") or tc.get("arguments") or {}
        if isinstance(args, dict):
            mapped = _antigravity_args(args)
            existing = out.get("tool_input")
            if isinstance(existing, dict):
                mapped = {**mapped, **existing}
            out["tool_input"] = mapped
            if mapped.get("command") and not out.get("command"):
                out["command"] = mapped["command"]

    tool = str(out.get("tool_name") or "")
    lower = tool.lower()
    if tool.startswith("mcp__") or tool.upper().startswith("MCP:"):
        out["hook_event_name"] = "beforeMCPExecution"
        return out

    rename = _AGY_TOOLS.get(lower)
    if rename:
        out["tool_name"] = rename[0]
        if rename[1] and not out.get("hook_event_name"):
            out["hook_event_name"] = rename[1]
        tool = rename[0]
        lower = tool.lower()

    if lower == "bash":
        cmd = out.get("command") or _input_str(out, "command")
        if cmd:
            out["command"] = cmd
        out.setdefault("hook_event_name", "beforeShellExecution")

    if lower == "apply_patch":
        path = _patch_path(out)
        out["tool_name"] = "Write"
        if path:
            inp = _input_dict(out)
            inp["path"] = path
            out["tool_input"] = inp

    return out


def _antigravity_args(args: dict[str, Any]) -> dict[str, Any]:
    mapped = dict(args)
    for src, dst in _AGY_ARG:
        v = args.get(src)
        if isinstance(v, str) and v and dst not in mapped:
            mapped[dst] = v
    return mapped


def _input_dict(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload.get("tool_input")
    return dict(inp) if isinstance(inp, dict) else {}


def _input_str(payload: dict[str, Any], key: str) -> str:
    inp = payload.get("tool_input")
    if isinstance(inp, dict):
        v = inp.get(key)
        if isinstance(v, str):
            return v
    return ""


def _patch_path(payload: dict[str, Any]) -> str:
    blob = payload.get("command") or _input_str(payload, "command")
    if not isinstance(blob, str) or not blob:
        return ""
    m = _PATCH_FILE.search(blob)
    return m.group(1).strip() if m else ""
