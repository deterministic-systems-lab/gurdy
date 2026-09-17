#!/usr/bin/env python3
"""afterMCPExecution: refresh the identity sidecar. Observation only.

Does not read result_json. A hook that copied tool output into a file would
be a second store of payloads, which the ledger is forbidden from being.
"""

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
