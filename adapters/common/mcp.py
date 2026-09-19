"""Build gurdy-wrap.sh MCP entries for any host config format."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def load_servers(root: Path) -> dict[str, dict[str, Any]]:
    path = root / "adapters" / "cursor" / "servers.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    return dict(doc.get("servers") or {})


def wrap_command(root: Path) -> str:
    return str((root / "adapters" / "cursor" / "wrap.sh").resolve())


def stdio_wrapped(servers: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name, spec in servers.items():
        if spec.get("transport", "stdio") != "stdio":
            continue
        if spec.get("wrap", True) is False:
            continue
        if not spec.get("command"):
            continue
        out[name] = spec
    return out


def wrap_stdio_json(wrap_cmd: str, name: str, spec: dict[str, Any]) -> dict[str, Any]:
    return {
        "command": wrap_cmd,
        "args": [name, "--", spec["command"], *list(spec.get("args") or [])],
    }


def merge_mcp_servers(existing: dict[str, Any], generated: dict[str, Any]) -> dict[str, Any]:
    out = dict(existing) if existing else {}
    servers = dict(out.get("mcpServers") or {})
    servers.update(generated)
    out["mcpServers"] = servers
    return out


def merge_codex_toml(
    text: str, name: str, command: str, args: list[str]
) -> str:
    """Insert or replace [mcp_servers.<name>] without a TOML library."""
    header = f"[mcp_servers.{name}]"
    block = (
        f"{header}\n"
        f"command = {_toml_str(command)}\n"
        f"args = {_toml_array(args)}\n"
    )
    pattern = re.compile(
        rf"^\[mcp_servers\.{re.escape(name)}\][^\[]*",
        re.MULTILINE,
    )
    if pattern.search(text):
        return pattern.sub(block + "\n", text, count=1)
    body = text.rstrip()
    if body:
        return body + "\n\n" + block
    return block


def _toml_str(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _toml_array(values: list[str]) -> str:
    return "[" + ", ".join(_toml_str(v) for v in values) + "]"
