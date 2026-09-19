#!/usr/bin/env python3
"""Installers write host config under --home, not the real homedir."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_install(host: str, home: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "adapters" / "connect.py"),
            "--root",
            str(ROOT),
            "--home",
            str(home),
            "--host",
            host,
        ],
        check=True,
    )


def main() -> int:
    home = ROOT / "adapters" / ".tmp-connect-home"
    if home.exists():
        shutil.rmtree(home)
    home.mkdir()
    try:
        run_install("claude", home)
        settings = json.loads((home / ".claude" / "settings.json").read_text())
        pre = settings["hooks"]["PreToolUse"]
        if not pre:
            raise SystemExit("claude: missing PreToolUse")
        cmd = json.dumps(pre)
        if "adapters/claude/pre_tool_use.py" not in cmd:
            raise SystemExit(f"claude: hook command missing: {cmd}")
        mcp = json.loads((home / ".claude.json").read_text())
        fs = mcp["mcpServers"]["filesystem"]
        if "wrap.sh" not in fs["command"]:
            raise SystemExit(f"claude: filesystem not wrapped: {fs}")

        run_install("antigravity", home)
        hooks = json.loads((home / ".gemini" / "config" / "hooks.json").read_text())
        if "gurdy" not in hooks:
            raise SystemExit("antigravity: missing gurdy hook")
        mcp = json.loads((home / ".gemini" / "config" / "mcp_config.json").read_text())
        if "wrap.sh" not in mcp["mcpServers"]["filesystem"]["command"]:
            raise SystemExit("antigravity: filesystem not wrapped")

        run_install("chatgpt", home)
        hooks = json.loads((home / ".codex" / "hooks.json").read_text())
        if "PreToolUse" not in hooks["hooks"]:
            raise SystemExit("codex: missing PreToolUse")
        toml = (home / ".codex" / "config.toml").read_text()
        if "[mcp_servers.filesystem]" not in toml:
            raise SystemExit("codex: missing filesystem table")
        if "wrap.sh" not in toml:
            raise SystemExit("codex: wrap.sh not in toml")
        if "hooks = true" not in toml:
            raise SystemExit("codex: hooks feature not enabled")

        run_install("cursor", home)
        if not (home / ".cursor" / "hooks.json").is_file():
            raise SystemExit("cursor: hooks.json missing")
        mcp = json.loads((home / ".cursor" / "mcp.json").read_text())
        if "filesystem" not in mcp.get("mcpServers", {}):
            raise SystemExit("cursor: filesystem missing")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
