"""Identity sidecar + TIS mint for Cursor hooks.

Cursor's beforeMCPExecution payload carries user_email and conversation_id.
The shim reads ~/.gurdy/identity/current.txn (last-writer-wins across
concurrent chats) into decideCall. Observed principal stays svc:stdio:…;
this file is the asserted claim only.

Never logs tool_input or result_json. Those are payloads; the ledger stores
hashes (NFR-7).
"""

from __future__ import annotations

import json
import os
import socket
import sys
from http.client import HTTPConnection
from pathlib import Path
from typing import Any

GURDY_HOME = Path(os.environ.get("GURDY_HOME", Path.home() / ".gurdy"))
IDENTITY_DIR = GURDY_HOME / "identity"
STATE_DIR = Path(os.environ.get("GURDY_STATE_DIR", GURDY_HOME / "state"))


class UnixHTTPConnection(HTTPConnection):
    def __init__(self, sock_path: str, timeout: float = 0.4) -> None:
        super().__init__("localhost", timeout=timeout)
        self._sock_path = sock_path

    def connect(self) -> None:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(self.timeout)
        s.connect(self._sock_path)
        self.sock = s


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def write_json(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")


def bind_identity(payload: dict[str, Any]) -> dict[str, Any]:
    IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
    conv = payload.get("conversation_id") or "unknown"
    email = payload.get("user_email") or ""
    server = payload.get("mcp_server_name") or ""
    record = {
        "conversation_id": conv,
        "user_email": email,
        "mcp_server_name": server,
        "hook_event_name": payload.get("hook_event_name"),
        "model": payload.get("model"),
    }
    path = IDENTITY_DIR / f"{conv}.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    (IDENTITY_DIR / "current.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8"
    )
    tok = mint_if_possible(conv, email, server)
    if tok:
        (IDENTITY_DIR / f"{conv}.txn").write_text(tok, encoding="utf-8")
        (IDENTITY_DIR / "current.txn").write_text(tok, encoding="utf-8")
        record["txn_minted"] = True
    else:
        record["txn_minted"] = False
    return record


def mint_if_possible(conversation_id: str, email: str, server: str) -> str | None:
    """POST /mint on the wrap's TIS socket. Fail-open: a missing socket is fine."""
    candidates = []
    if server:
        candidates.append(STATE_DIR / f"tis-{server}.sock")
    candidates.append(STATE_DIR / "tis-cursor.sock")
    candidates.append(STATE_DIR / "tis.sock")
    body = json.dumps(
        {
            "agent": conversation_id,
            "human_actor": email,
            "scope": {
                "compartments": ["*"],
                "resource_types": ["*"],
                "actions": ["*"],
                "purpose": "*",
            },
        }
    ).encode()
    for sock in candidates:
        if not sock.is_socket() and not sock.exists():
            continue
        try:
            conn = UnixHTTPConnection(str(sock))
            conn.request("POST", "/mint", body=body, headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            data = json.loads(resp.read().decode())
            conn.close()
            if resp.status == 200 and data.get("txn"):
                return data["txn"]
        except OSError:
            continue
        except Exception:
            continue
    return None
