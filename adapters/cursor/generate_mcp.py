#!/usr/bin/env python3
"""Generate adapters/cursor/mcp.json from adapters/cursor/servers.json.

Stdio servers are launched through adapters/cursor/wrap.sh so every tools/call
hits gurdy-proxy. HTTP/SSE servers stay at their upstream URL unless wrap is
true, in which case Cursor is pointed at a local gurdy-http-proxy.sh hop.
The Atlassian plugin channel is ungoverable even then until Cursor uses that
URL and a tools/call lands in ~/.gurdy/ledger/atlassian/.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def wrap_stdio(wrap_cmd: str, name: str, spec: dict) -> dict:
    args = [name, "--", spec["command"], *spec.get("args", [])]
    return {
        "command": wrap_cmd,
        "args": args,
    }


def emit_http(spec: dict, wrap: bool) -> dict:
    if wrap:
        listen = spec.get("proxy_listen", "127.0.0.1:18090")
        path = urlparse(spec["url"]).path or "/"
        out: dict = {"url": f"http://{listen}{path}"}
    else:
        out = {"url": spec["url"]}
    if spec.get("headers"):
        out["headers"] = spec["headers"]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--servers", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--wrap-command",
        default=None,
        help="gurdy-wrap.sh path (default: ${workspaceFolder}/adapters/cursor/wrap.sh)",
    )
    args = ap.parse_args()

    wrap_cmd = args.wrap_command or "${workspaceFolder}/adapters/cursor/wrap.sh"
    doc = json.loads(args.servers.read_text(encoding="utf-8"))
    servers = {}
    for name, spec in doc["servers"].items():
        transport = spec.get("transport", "stdio")
        wrap = spec.get("wrap", transport == "stdio")
        if transport == "stdio" and wrap:
            servers[name] = wrap_stdio(wrap_cmd, name, spec)
        elif transport in {"http", "sse", "streamable-http"}:
            servers[name] = emit_http(spec, wrap)
        else:
            raise SystemExit(f"unknown transport for {name}: {transport}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"mcpServers": servers}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
