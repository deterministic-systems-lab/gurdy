#!/usr/bin/env python3
"""sessionStart: bind identity before the first MCP call of a conversation."""

from __future__ import annotations

from identity import bind_identity, read_payload, write_json


def main() -> None:
    payload = read_payload()
    try:
        bind_identity(payload)
    except Exception:
        pass
    write_json({})


if __name__ == "__main__":
    main()
