#!/usr/bin/env python3
"""Pack names in the policy-impact report.

docs/policy-impact.md is tracked, and `make impact` passes absolute paths while
the command in the report header passes relative ones. Both name the same file,
so both must render the same line or the report churns with whoever ran it.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from policy_impact import ROOT, _shown


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    pack = ROOT / "policy" / "pack.cedar"
    if not pack.is_file():
        raise SystemExit(f"missing {pack}")

    eq(_shown(pack), "policy/pack.cedar", "absolute in-repo pack")

    # The two documented ways to name the same file must agree.
    cwd = Path.cwd()
    try:
        os.chdir(ROOT)
        eq(
            _shown(Path("./policy/pack.cedar")),
            _shown(pack),
            "relative and absolute disagree",
        )
    finally:
        os.chdir(cwd)

    # A candidate from outside the clone keeps its path: where it came from is
    # the useful part, and it is not ours to shorten.
    with tempfile.TemporaryDirectory() as tmp:
        outside = Path(tmp) / "it-sent-this.cedar"
        outside.write_text("// candidate\n", encoding="utf-8")
        eq(_shown(outside), str(outside.resolve()), "outside the repo")

    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
