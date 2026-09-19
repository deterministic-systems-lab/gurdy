"""Run one synthesized tools/call through gurdy-proxy and return a hook verdict.

The hook is the Cursor-visible Act stage for native tools. Gurdy still decides;
we do not reimplement Cedar. A flock serializes one-shot proxy processes so
they resume one hash chain instead of corrupting it.

When ~/.gurdy/state/enforce (or GURDY_ENFORCE=1) is set, the proxy is started
with -enforce so the ledger records action_applied=blocked, and this module
returns permission=deny so Cursor does not run the tool. The file is read on
every call, so a fleet flip takes effect on the next native hook without a
Cursor restart. Fail-open on any error (NFR-3), including a missing binary.
"""

from __future__ import annotations

import fcntl
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from classify import classify
from identity import GURDY_HOME, IDENTITY_DIR, STATE_DIR, mint_if_possible
from policy_path import resolve_policy
from root import find_proxy, repo_root

ROOT = repo_root()
PROXY = find_proxy(ROOT)
TXN_FILE = IDENTITY_DIR / "current.txn"


def host_name() -> str:
    return os.environ.get("GURDY_HOST") or "cursor"


def ledger_dir() -> Path:
    return Path(
        os.environ.get("GURDY_HOST_LEDGER")
        or os.environ.get("GURDY_CURSOR_LEDGER")
        or (GURDY_HOME / "ledger" / host_name())
    )


def tis_sock() -> Path:
    return STATE_DIR / f"tis-{host_name()}.sock"


# Kept for scripts that imported the old module-level paths.
LEDGER_DIR = Path(os.environ.get("GURDY_CURSOR_LEDGER", GURDY_HOME / "ledger" / "cursor"))
TIS_SOCK = STATE_DIR / "tis-cursor.sock"


def enforce_on() -> bool:
    """Act is a flag on disk, not a process lifetime. Re-read every call."""
    env = os.environ.get("GURDY_ENFORCE", "").lower() in {"1", "true", "yes"}
    return env or (STATE_DIR / "enforce").is_file()


def decide_payload(payload: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    """Return (decision, call). decision is skip when classify declines."""
    call = classify(payload)
    if call is None:
        return "skip", None
    return _decide(call, payload), call


def govern(payload: dict[str, Any]) -> dict[str, Any]:
    decision, call = decide_payload(payload)
    if decision == "skip" or call is None:
        return {"permission": "allow"}
    if enforce_on() and decision == "block":
        return {
            "permission": "deny",
            "user_message": (
                f"Gurdy policy blocked this call "
                f"(see ~/.gurdy/ledger/{host_name()})."
            ),
            "agent_message": (
                f"Blocked by Gurdy pack: {call.get('tool')} "
                f"{(call.get('arguments') or {}).get('path', '')}".strip()
            ),
        }
    return {"permission": "allow"}


def _decide(call: dict[str, Any], payload: dict[str, Any]) -> str:
    if not PROXY.is_file():
        return "indeterminate"
    frame = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": call["tool"], "arguments": call.get("arguments") or {}},
    }
    line = json.dumps(frame, separators=(",", ":")) + "\n"
    led = ledger_dir()
    sock = tis_sock()
    led.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(STATE_DIR, 0o700)
    argv = [
        str(PROXY),
        "-stdio",
        "-tenant",
        os.environ.get("GURDY_TENANT", "local"),
        "-deploy-id",
        os.environ.get("GURDY_DEPLOY_ID") or os.uname().nodename.split(".")[0],
        "-ledger-dir",
        str(led),
        "-state-dir",
        str(STATE_DIR),
        "-tis-socket",
        str(sock),
        "-txn-file",
        str(TXN_FILE),
        "-policy",
        str(resolve_policy(ROOT)),
    ]
    if enforce_on():
        argv.append("-enforce")
    argv.extend(["--", "cat"])
    lock_path = STATE_DIR / f"{host_name()}.lock"
    with open(lock_path, "a", encoding="utf-8") as lf:
        fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
        try:
            proc = subprocess.Popen(
                argv,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except OSError:
            return "indeterminate"
        try:
            _wait_sock(sock, 1.0)
            conv = str(payload.get("conversation_id") or "unknown")
            email = str(payload.get("user_email") or "")
            tok = mint_if_possible(conv, email, host_name())
            if tok:
                (IDENTITY_DIR / f"{conv}.txn").write_text(tok, encoding="utf-8")
                TXN_FILE.write_text(tok, encoding="utf-8")
            assert proc.stdin is not None
            proc.stdin.write(line.encode())
            proc.stdin.close()
            stderr = proc.communicate(timeout=8)[1]
        except (OSError, subprocess.TimeoutExpired):
            proc.kill()
            return "indeterminate"
    return _parse_decision(stderr.decode(errors="replace"))


def _wait_sock(path: Path, timeout: float) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists():
            return
        time.sleep(0.02)


def _parse_decision(stderr: str) -> str:
    for raw in stderr.splitlines():
        raw = raw.strip()
        if not raw.startswith("{"):
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if obj.get("msg") == "decision" or "decision" in obj:
            d = obj.get("decision")
            if isinstance(d, str) and d:
                return d
    return "indeterminate"
