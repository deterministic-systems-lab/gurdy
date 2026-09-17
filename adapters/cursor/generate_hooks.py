#!/usr/bin/env python3
"""Generate adapters/cursor/hooks.json with absolute paths to this checkout's scripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    hooks = args.root / "adapters" / "cursor" / "hooks"
    py = lambda name: f"python3 {hooks / name}"
    # Native Cursor tools are synthesized as mcp/tools_call so pack.cedar
    # sees them. MCP stays on beforeMCPExecution (identity only) to avoid a
    # second decision on a call gurdy-proxy -stdio already recorded.
    doc = {
        "version": 1,
        "hooks": {
            "sessionStart": [{"command": py("session_start.py")}],
            "beforeSubmitPrompt": [{"command": py("before_submit_prompt.py")}],
            "subagentStart": [{"command": py("subagent_start.py")}],
            "beforeReadFile": [{"command": py("before_read_file.py")}],
            "beforeShellExecution": [{"command": py("before_shell_execution.py")}],
            "preToolUse": [
                {
                    "command": py("pre_tool_use.py"),
                    "matcher": "Write|Delete|StrReplace|Grep|EditNotebook|WebFetch|WebSearch|Glob|SemanticSearch",
                }
            ],
            "beforeMCPExecution": [{"command": py("before_mcp_execution.py")}],
            "afterMCPExecution": [{"command": py("after_mcp_execution.py")}],
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
