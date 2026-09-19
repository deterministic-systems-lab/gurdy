#!/usr/bin/env python3
"""beforeShellExecution: rm/unlink and credential paths in argv hit the pack."""

from __future__ import annotations

from govern import govern
from identity import bind_identity, read_payload, write_json


def main() -> None:
    payload = read_payload()
    try:
        bind_identity(payload)
    except Exception:
        pass
    try:
        write_json(govern(payload))
    except Exception:
        write_json({"permission": "allow"})


if __name__ == "__main__":
    main()
