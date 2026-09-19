#!/usr/bin/env python3
"""Install Gurdy into Claude Code: user hooks + wrapped stdio MCP."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_COMMON = Path(__file__).resolve().parents[1] / "common"
if str(_COMMON) not in sys.path:
    sys.path.insert(0, str(_COMMON))

from mcp import (  # noqa: E402
    load_servers,
    merge_mcp_servers,
    stdio_wrapped,
    wrap_command,
    wrap_stdio_json,
)

HOOK_MATCHER = "Read|Write|Edit|Bash|Grep|Glob|WebFetch|WebSearch|NotebookEdit"


def merge_hooks(existing: dict, command: str) -> dict:
    out = dict(existing) if existing else {}
    hooks = dict(out.get("hooks") or {})
    pre = [
        e
        for e in list(hooks.get("PreToolUse") or [])
        if "gurdy" not in json.dumps(e).lower()
        and "adapters/claude/pre_tool_use.py" not in json.dumps(e)
    ]
    pre.append(
        {
            "matcher": HOOK_MATCHER,
            "hooks": [{"type": "command", "command": command}],
        }
    )
    hooks["PreToolUse"] = pre
    out["hooks"] = hooks
    return out


def install(root: Path, home: Path) -> list[str]:
    wrote: list[str] = []
    gurdy = home / ".gurdy"
    for sub in ("ledger", "state", "identity"):
        d = gurdy / sub
        d.mkdir(parents=True, exist_ok=True)
        if sub == "state":
            os.chmod(d, 0o700)

    claude_dir = home / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    settings_path = claude_dir / "settings.json"
    existing = {}
    if settings_path.exists():
        existing = json.loads(settings_path.read_text(encoding="utf-8"))
    command = f"python3 {root / 'adapters' / 'claude' / 'pre_tool_use.py'}"
    settings_path.write_text(
        json.dumps(merge_hooks(existing, command), indent=2) + "\n", encoding="utf-8"
    )
    wrote.append(str(settings_path))

    claude_json = home / ".claude.json"
    current = {}
    if claude_json.exists():
        current = json.loads(claude_json.read_text(encoding="utf-8"))
    wrap = wrap_command(root)
    generated = {
        name: wrap_stdio_json(wrap, name, spec)
        for name, spec in stdio_wrapped(load_servers(root)).items()
    }
    for spec in generated.values():
        spec["type"] = "stdio"
    claude_json.write_text(
        json.dumps(merge_mcp_servers(current, generated), indent=2) + "\n",
        encoding="utf-8",
    )
    wrote.append(str(claude_json))
    return wrote


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--home", type=Path, default=Path.home())
    args = ap.parse_args()
    root = args.root.resolve()
    for path in install(root, args.home):
        print(f"wrote {path}")
    print("restart Claude Code, then /mcp to approve wrapped servers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
