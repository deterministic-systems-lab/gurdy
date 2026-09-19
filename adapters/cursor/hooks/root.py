"""Locate the Gurdy checkout from any adapter script."""

from __future__ import annotations

from pathlib import Path


def repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__)).resolve()
    for p in [here, *here.parents]:
        if (p / "policy" / "controls.json").is_file():
            return p
    raise RuntimeError("cannot locate Gurdy repo root (policy/controls.json)")


def find_proxy(root: Path | None = None) -> Path:
    import os

    env = os.environ.get("GURDY_PROXY")
    if env:
        return Path(env)
    base = root or repo_root()
    for cand in (base / "bin" / "gurdy-proxy", base / "proxy" / "gurdy-proxy"):
        if cand.is_file():
            return cand
    return base / "bin" / "gurdy-proxy"
