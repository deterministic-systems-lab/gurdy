#!/usr/bin/env python3
"""subagentStart: bind conversation identity. Do not Cedar-block subagents."""

from __future__ import annotations

from identity import bind_identity, read_payload, write_json


def main() -> None:
    payload = read_payload()
    try:
        bind_identity(payload)
    except Exception:
        pass
    write_json({"permission": "allow"})


if __name__ == "__main__":
    main()
