#!/usr/bin/env python3
"""beforeSubmitPrompt: annotate identity with the Cursor model. Not a decision.

Composer HTTP never hits gurdy-proxy, so this must not synthesize llm/completion.
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
