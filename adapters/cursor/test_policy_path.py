#!/usr/bin/env python3
"""GURDY_POLICY → pulled current.cedar → git pack. Python and the shell helper."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ADAPTER = Path(__file__).resolve().parent
REPO = ADAPTER.parent.parent
sys.path.insert(0, str(ADAPTER / "hooks"))

from policy_path import resolve_policy  # noqa: E402

HELPER = ADAPTER / "policy-path.sh"
GIT_PACK = REPO / "policy" / "pack.cedar"


def sh(env: dict[str, str]) -> Path:
    proc = subprocess.run(
        ["sh", str(HELPER), str(REPO)],
        capture_output=True,
        text=True,
        env={**os.environ, **env},
        check=True,
    )
    return Path(proc.stdout.strip())


def main() -> int:
    os.environ["GURDY_POLICY"] = str(GIT_PACK)
    if resolve_policy(REPO) != GIT_PACK:
        raise SystemExit("python: GURDY_POLICY not preferred")
    if sh({"GURDY_POLICY": str(GIT_PACK)}) != GIT_PACK:
        raise SystemExit("shell: GURDY_POLICY not preferred")
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp)
        pulled = home / "policy" / "current.cedar"
        pulled.parent.mkdir()
        pulled.write_text("permit (principal, action, resource);\n", encoding="utf-8")
        env = {"GURDY_HOME": str(home)}
        env.pop("GURDY_POLICY", None)
        old = os.environ.pop("GURDY_POLICY", None)
        os.environ["GURDY_HOME"] = str(home)
        try:
            got = resolve_policy(REPO)
            if got != pulled:
                raise SystemExit(f"python pulled: {got} want {pulled}")
            if sh(env) != pulled:
                raise SystemExit(f"shell pulled: {sh(env)} want {pulled}")
            missing = home / "nope.cedar"
            env["GURDY_POLICY"] = str(missing)
            os.environ["GURDY_POLICY"] = str(missing)
            if resolve_policy(REPO) != pulled:
                raise SystemExit("missing GURDY_POLICY must fall through to pulled")
            if sh(env) != pulled:
                raise SystemExit("shell missing GURDY_POLICY must fall through")
        finally:
            os.environ.pop("GURDY_HOME", None)
            if old is None:
                os.environ.pop("GURDY_POLICY", None)
            else:
                os.environ["GURDY_POLICY"] = old
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
