#!/usr/bin/env python3
"""beforeMCPExecution: bind user_email + conversation_id, never delay traffic.

Monitor mode (until 3:15): permission is always allow. Enforcement is Gurdy's
actuator (stream B), not this hook. Fail-open on any error.
"""

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
