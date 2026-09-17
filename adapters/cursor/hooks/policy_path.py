"""Resolve which Cedar file a one-shot proxy should load.

Order: GURDY_POLICY (if the file exists), then
$GURDY_HOME/policy/current.cedar (pulled by ship.py), then the git pack.
Must stay in lockstep with adapters/cursor/policy-path.sh.
"""

from __future__ import annotations

import os
from pathlib import Path

from root import repo_root

ROOT = repo_root()


def gurdy_home() -> Path:
    return Path(os.environ.get("GURDY_HOME", Path.home() / ".gurdy"))


def resolve_policy(root: Path | None = None) -> Path:
    base = root or ROOT
    env = os.environ.get("GURDY_POLICY")
    if env:
        p = Path(env)
        if p.is_file():
            return p
    pulled = gurdy_home() / "policy" / "current.cedar"
    if pulled.is_file():
        return pulled
    return base / "policy" / "pack.cedar"
