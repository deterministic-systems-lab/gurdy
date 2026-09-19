"""Stdin hook runner shared by Claude Code, Antigravity, and Codex."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_CURSOR_HOOKS = _HERE.parent / "cursor" / "hooks"
for p in (_HERE, _CURSOR_HOOKS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from govern import decide_payload, enforce_on  # noqa: E402
from identity import bind_identity  # noqa: E402
from normalize import normalize  # noqa: E402
from verdict import fail_open, format_verdict  # noqa: E402


def main(host: str) -> None:
    os.environ.setdefault("GURDY_HOST", host)
    raw = sys.stdin.read()
    try:
        payload: dict[str, Any] = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        sys.stdout.write(json.dumps(fail_open(host)) + "\n")
        return
    try:
        payload = normalize(payload)
        try:
            bind_identity(payload)
        except Exception:
            pass
        decision, call = decide_payload(payload)
        if decision == "skip":
            out = fail_open(host)
        else:
            out = format_verdict(host, decision, call, enforce_on())
        sys.stdout.write(json.dumps(out) + "\n")
    except Exception:
        sys.stdout.write(json.dumps(fail_open(host)) + "\n")
