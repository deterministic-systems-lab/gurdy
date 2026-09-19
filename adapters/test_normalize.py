#!/usr/bin/env python3
"""Host payloads collapse onto the classify shape."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "common"))
sys.path.insert(0, str(Path(__file__).resolve().parent / "cursor" / "hooks"))

from classify import classify
from normalize import normalize


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    claude_read = normalize(
        {
            "hook_event_name": "PreToolUse",
            "tool_name": "Read",
            "tool_input": {"file_path": "/Users/u/.ssh/id_rsa"},
        }
    )
    eq(
        classify(claude_read),
        {"tool": "read_file", "arguments": {"path": "/Users/u/.ssh/id_rsa"}},
        "claude read",
    )
    eq(
        classify(
            {
                "tool_name": "Bash",
                "tool_input": {"command": "rm -rf /tmp/x"},
            }
        ),
        {"tool": "rm", "arguments": {"path": "/tmp/x"}},
        "claude bash",
    )
    eq(
        classify(
            {
                "tool_name": "mcp__filesystem__read_file",
                "tool_input": {"path": "/Users/u/.ssh/id_rsa"},
            }
        ),
        None,
        "skip wrapped mcp",
    )
    eq(
        classify(
            {
                "conversationId": "abc",
                "toolCall": {
                    "name": "view_file",
                    "args": {"AbsolutePath": "/Users/u/.ssh/id_rsa"},
                },
            }
        ),
        {"tool": "read_file", "arguments": {"path": "/Users/u/.ssh/id_rsa"}},
        "antigravity view_file",
    )
    eq(
        classify(
            {
                "toolCall": {
                    "name": "run_command",
                    "args": {"CommandLine": "cat ~/.ssh/id_rsa"},
                }
            }
        )["tool"],
        "read_file",
        "antigravity cat ssh",
    )
    eq(
        classify(
            {
                "tool_name": "apply_patch",
                "tool_input": {
                    "command": "*** Begin Patch\n*** Update File: /tmp/secret.env\n"
                },
            }
        ),
        {"tool": "write_file", "arguments": {"path": "/tmp/secret.env"}},
        "codex apply_patch",
    )
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
