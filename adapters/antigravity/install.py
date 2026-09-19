#!/usr/bin/env python3
"""Install Gurdy into Antigravity: ~/.gemini/config hooks + MCP wrap."""

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

HOOK_MATCHER = (
    "view_file|write_to_file|replace_file_content|multi_replace_file_content|"
    "grep_search|find_by_name|list_dir|run_command|search_web|read_url_content"
)


def merge_hooks(existing: dict, command: str) -> dict:
    out = dict(existing) if existing else {}
    out["gurdy"] = {
        "PreToolUse": [
            {
                "matcher": HOOK_MATCHER,
                "hooks": [
                    {"type": "command", "command": command, "timeout": 15}
                ],
            }
        ]
    }
    return out


def install(root: Path, home: Path) -> list[str]:
    wrote: list[str] = []
    gurdy = home / ".gurdy"
    for sub in ("ledger", "state", "identity"):
        d = gurdy / sub
        d.mkdir(parents=True, exist_ok=True)
        if sub == "state":
            os.chmod(d, 0o700)

    cfg = home / ".gemini" / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    hooks_path = cfg / "hooks.json"
    existing = {}
    if hooks_path.exists():
        existing = json.loads(hooks_path.read_text(encoding="utf-8"))
    command = f"python3 {root / 'adapters' / 'antigravity' / 'pre_tool_use.py'}"
    hooks_path.write_text(
        json.dumps(merge_hooks(existing, command), indent=2) + "\n", encoding="utf-8"
    )
    wrote.append(str(hooks_path))

    mcp_path = cfg / "mcp_config.json"
    current = {}
    if mcp_path.exists():
        current = json.loads(mcp_path.read_text(encoding="utf-8"))
    wrap = wrap_command(root)
    generated = {
        name: wrap_stdio_json(wrap, name, spec)
        for name, spec in stdio_wrapped(load_servers(root)).items()
    }
    mcp_path.write_text(
        json.dumps(merge_mcp_servers(current, generated), indent=2) + "\n",
        encoding="utf-8",
    )
    wrote.append(str(mcp_path))
    return wrote


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--home", type=Path, default=Path.home())
    args = ap.parse_args()
    for path in install(args.root.resolve(), args.home):
        print(f"wrote {path}")
    print("reload Antigravity customizations (Settings > Customizations > Hooks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
