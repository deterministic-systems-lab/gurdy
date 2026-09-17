#!/usr/bin/env python3
"""Install the generated Cursor templates into ~/.cursor.

Merges mcpServers into ~/.cursor/mcp.json rather than replacing the file, so
an existing personal server is not deleted. hooks.json is replaced: a second
beforeMCPExecution list would double-mint.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def merge_mcp(existing: dict, generated: dict) -> dict:
    out = dict(existing) if existing else {}
    servers = dict(out.get("mcpServers") or {})
    servers.update(generated.get("mcpServers") or {})
    out["mcpServers"] = servers
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    args = ap.parse_args()

    home = Path.home()
    cursor = home / ".cursor"
    cursor.mkdir(parents=True, exist_ok=True)
    for sub in ("ledger", "state", "identity"):
        d = home / ".gurdy" / sub
        d.mkdir(parents=True, exist_ok=True)
        if sub == "state":
            os.chmod(d, 0o700)

    adapter = args.root / "adapters" / "cursor"
    wrap = str(adapter / "wrap.sh")
    subprocess.run(
        [
            sys.executable,
            str(adapter / "generate_mcp.py"),
            "--root",
            str(args.root),
            "--servers",
            str(adapter / "servers.json"),
            "--out",
            str(adapter / "mcp.local.json"),
            "--wrap-command",
            wrap,
        ],
        check=True,
    )
    subprocess.run(
        [
            sys.executable,
            str(adapter / "generate_hooks.py"),
            "--root",
            str(args.root),
            "--out",
            str(adapter / "hooks.json"),
        ],
        check=True,
    )
    gen_mcp = json.loads((adapter / "mcp.local.json").read_text(encoding="utf-8"))
    dest_mcp = cursor / "mcp.json"
    existing = {}
    if dest_mcp.exists():
        existing = json.loads(dest_mcp.read_text(encoding="utf-8"))
    dest_mcp.write_text(json.dumps(merge_mcp(existing, gen_mcp), indent=2) + "\n", encoding="utf-8")

    gen_hooks = (adapter / "hooks.json").read_text(encoding="utf-8")
    (cursor / "hooks.json").write_text(gen_hooks, encoding="utf-8")
    print(f"merged MCP servers into {dest_mcp}")
    print(f"wrote {cursor / 'hooks.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
