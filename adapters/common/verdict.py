"""Host-specific hook Act responses. Cedar still decides; this is only the
shape the runtime understands.
"""

from __future__ import annotations

from typing import Any

_CLAUDE_FAMILY = {"claude", "codex", "chatgpt"}


def format_verdict(
    host: str,
    decision: str,
    call: dict[str, Any] | None,
    enforce: bool,
) -> dict[str, Any]:
    blocked = enforce and decision == "block"
    host = (host or "cursor").lower()
    if host == "cursor":
        if not blocked:
            return {"permission": "allow"}
        return {
            "permission": "deny",
            "user_message": f"Gurdy policy blocked this call (see ~/.gurdy/ledger/{host}).",
            "agent_message": _agent_message(call),
        }
    if host == "antigravity":
        if not blocked:
            return {"decision": "allow"}
        return {"decision": "deny", "reason": _agent_message(call)}
    if host in _CLAUDE_FAMILY:
        if not blocked:
            return {}
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": _agent_message(call),
            }
        }
    if not blocked:
        return {"permission": "allow"}
    return {"permission": "deny", "user_message": _agent_message(call)}


def fail_open(host: str) -> dict[str, Any]:
    host = (host or "cursor").lower()
    if host == "antigravity":
        return {"decision": "allow"}
    if host in _CLAUDE_FAMILY:
        return {}
    return {"permission": "allow"}


def _agent_message(call: dict[str, Any] | None) -> str:
    if not call:
        return "Blocked by Gurdy pack."
    args = call.get("arguments") or {}
    extra = args.get("path") or args.get("url") or ""
    return f"Blocked by Gurdy pack: {call.get('tool')} {extra}".strip()
