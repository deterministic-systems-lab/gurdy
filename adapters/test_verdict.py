#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "common"))

from verdict import fail_open, format_verdict


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    call = {"tool": "read_file", "arguments": {"path": "/x"}}
    eq(
        format_verdict("cursor", "block", call, True)["permission"],
        "deny",
        "cursor deny",
    )
    eq(format_verdict("cursor", "block", call, False)["permission"], "allow", "cursor monitor")
    eq(
        format_verdict("claude", "block", call, True)["hookSpecificOutput"][
            "permissionDecision"
        ],
        "deny",
        "claude deny",
    )
    eq(format_verdict("claude", "block", call, False), {}, "claude monitor")
    eq(format_verdict("codex", "block", call, True)["hookSpecificOutput"]["hookEventName"], "PreToolUse", "codex shape")
    eq(format_verdict("antigravity", "block", call, True)["decision"], "deny", "agy deny")
    eq(format_verdict("antigravity", "allow", call, True)["decision"], "allow", "agy allow")
    eq(fail_open("claude"), {}, "claude fail-open")
    eq(fail_open("antigravity"), {"decision": "allow"}, "agy fail-open")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
