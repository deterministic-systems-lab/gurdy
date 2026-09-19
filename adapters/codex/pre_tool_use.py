#!/usr/bin/env python3
"""Codex / ChatGPT desktop PreToolUse → classify → gurdy-proxy."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))
from hook_main import run

if __name__ == "__main__":
    raise SystemExit(run("codex"))
