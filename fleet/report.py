"""Wrapper around gurdy-report for one or more ledger dirs.

Does not merge hash chains. Two exports signed under one key are still two
chains; concatenating them would produce a file gurdy-verify rejects. This
verifies each dir, runs gurdy-report on each, and prints them in order.
A fleet rollup that summed counts across unverified dirs is how a bad
export would disappear into a good one.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def ledger_dirs(root: Path) -> list[Path]:
    if root.is_dir() and list(root.glob("*.jsonl")):
        return [root]
    if not root.exists():
        return []
    return sorted(p for p in root.iterdir() if p.is_dir() and list(p.glob("*.jsonl")))


def find_report(overlay: Path) -> list[str]:
    vendor = overlay / "vendor" / "gurdy" / "reporter"
    if (vendor / "pyproject.toml").is_file():
        return ["uv", "run", "--directory", str(vendor), "gurdy-report"]
    return ["gurdy-report"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="report")
    ap.add_argument("--ledger", type=Path, required=True)
    ap.add_argument("--verifier", type=Path, required=True)
    ap.add_argument("--pubkey", type=Path, default=None)
    args = ap.parse_args(argv)

    overlay = Path(__file__).resolve().parent.parent
    dirs = ledger_dirs(args.ledger)
    if not dirs:
        print(f"report.py: no ledger files under {args.ledger}", file=sys.stderr)
        return 1

    cmd0 = find_report(overlay)
    rc = 0
    for i, d in enumerate(dirs):
        cmd = [
            *cmd0,
            str(d),
            "--verifier",
            str(args.verifier),
        ]
        if args.pubkey:
            cmd.extend(["--pubkey", str(args.pubkey)])
        print(f"## export {i + 1}/{len(dirs)}: {d}\n")
        proc = subprocess.run(cmd)
        if proc.returncode != 0:
            rc = proc.returncode
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
