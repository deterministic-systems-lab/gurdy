#!/usr/bin/env python3
"""Install Gurdy onto a host agent.

    python3 adapters/connect.py --root . --host cursor
    python3 adapters/connect.py --root . --host claude
    python3 adapters/connect.py --root . --host antigravity
    python3 adapters/connect.py --root . --host chatgpt
    python3 adapters/connect.py --root . --host all

chatgpt and codex are the same installer: ChatGPT desktop, the Codex IDE
extension, and Codex CLI share ~/.codex. ChatGPT on the web cannot be
connected; see docs/hosts.md.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

INSTALLERS = {
    "cursor": Path("adapters/cursor/install.py"),
    "claude": Path("adapters/claude/install.py"),
    "antigravity": Path("adapters/antigravity/install.py"),
    "codex": Path("adapters/codex/install.py"),
}


def resolve_hosts(name: str) -> list[str]:
    name = name.lower().strip()
    if name == "all":
        return ["cursor", "claude", "antigravity", "codex"]
    if name == "chatgpt":
        return ["codex"]
    if name in INSTALLERS:
        return [name]
    raise SystemExit(
        f"unknown host {name!r}; choose cursor, claude, antigravity, "
        "chatgpt, codex, or all"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--home", type=Path, default=Path.home())
    ap.add_argument(
        "--host",
        required=True,
        help="cursor | claude | antigravity | chatgpt | codex | all",
    )
    args = ap.parse_args()
    root = args.root.resolve()
    for host in resolve_hosts(args.host):
        script = root / INSTALLERS[host]
        if not script.is_file():
            raise SystemExit(f"missing installer {script}")
        if args.host.lower() == "all":
            print(f"== {host} ==")
        subprocess.run(
            [
                sys.executable,
                str(script),
                "--root",
                str(root),
                "--home",
                str(args.home),
            ],
            check=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
