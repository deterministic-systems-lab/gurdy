#!/usr/bin/env python3
"""Install Gurdy into Codex / ChatGPT desktop: hooks.json + config.toml MCP."""

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
    merge_codex_toml,
    stdio_wrapped,
    wrap_command,
    wrap_stdio_json,
)

HOOK_MATCHER = "Bash|apply_patch|Read|Write|Edit|WebSearch|WebFetch"


def merge_hooks(existing: dict, command: str) -> dict:
    out = dict(existing) if existing else {}
    hooks = dict(out.get("hooks") or {})
    pre = [
        e
        for e in list(hooks.get("PreToolUse") or [])
        if "gurdy" not in json.dumps(e).lower()
        and "adapters/codex/pre_tool_use.py" not in json.dumps(e)
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

    codex = home / ".codex"
    codex.mkdir(parents=True, exist_ok=True)
    hooks_path = codex / "hooks.json"
    existing = {}
    if hooks_path.exists():
        existing = json.loads(hooks_path.read_text(encoding="utf-8"))
    command = f"python3 {root / 'adapters' / 'codex' / 'pre_tool_use.py'}"
    hooks_path.write_text(
        json.dumps(merge_hooks(existing, command), indent=2) + "\n", encoding="utf-8"
    )
    wrote.append(str(hooks_path))

    wrap = wrap_command(root)
    toml_path = codex / "config.toml"
    text = toml_path.read_text(encoding="utf-8") if toml_path.exists() else ""
    if "hooks" not in text:
        text = ("[features]\nhooks = true\n\n" + text).rstrip() + "\n"
    for name, spec in stdio_wrapped(load_servers(root)).items():
        entry = wrap_stdio_json(wrap, name, spec)
        text = merge_codex_toml(text, name, entry["command"], entry["args"])
    toml_path.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    wrote.append(str(toml_path))
    return wrote


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--home", type=Path, default=Path.home())
    args = ap.parse_args()
    for path in install(args.root.resolve(), args.home):
        print(f"wrote {path}")
    print("in Codex run /hooks and trust the Gurdy hook; desktop ChatGPT shares ~/.codex")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
