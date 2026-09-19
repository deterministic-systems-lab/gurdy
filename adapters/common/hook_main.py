"""Bootstrap sys.path so a host pre_tool_use.py can live beside this file."""

from __future__ import annotations


def run(host: str) -> int:
    from hook import main

    main(host)
    return 0
