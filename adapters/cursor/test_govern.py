#!/usr/bin/env python3
"""Drive classify → gurdy-proxy and assert Cedar fires on a native Read."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ADAPTER = Path(__file__).resolve().parent
REPO = ADAPTER.parent.parent
HOOKS = ADAPTER / "hooks"


def main() -> int:
    proxy = REPO / "bin" / "gurdy-proxy"
    if not proxy.is_file():
        proxy = REPO / "proxy" / "gurdy-proxy"
    if not proxy.is_file():
        print("skip: no gurdy-proxy binary")
        return 0
    env = os.environ.copy()
    with tempfile.TemporaryDirectory() as tmp:
        env["GURDY_CURSOR_LEDGER"] = str(Path(tmp) / "ledger")
        env["GURDY_HOME"] = tmp
        env["GURDY_STATE_DIR"] = str(Path(tmp) / "state")
        env["GURDY_PROXY"] = str(proxy)
        env["GURDY_POLICY"] = str(REPO / "policy" / "pack.cedar")
        env["GURDY_ENFORCE"] = "1"
        proc = subprocess.run(
            [sys.executable, str(HOOKS / "before_read_file.py")],
            input=json.dumps(
                {
                    "hook_event_name": "beforeReadFile",
                    "file_path": str(Path.home() / ".ssh" / "id_rsa"),
                    "conversation_id": "test",
                    "user_email": "dev@example.com",
                }
            ).encode(),
            capture_output=True,
            env=env,
            timeout=20,
        )
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr.decode())
            raise SystemExit(f"hook exit {proc.returncode}")
        out = json.loads(proc.stdout.decode().strip().splitlines()[-1])
        if out.get("permission") != "deny":
            raise SystemExit(f"expected deny under GURDY_ENFORCE, got {out}")
        applied = []
        for p in Path(tmp).joinpath("ledger").glob("*.jsonl"):
            for line in p.read_text(encoding="utf-8").splitlines():
                if not line.startswith("{"):
                    continue
                rec = json.loads(line)
                if rec.get("kind") == "decision" and rec.get("action_applied"):
                    applied.append(rec["action_applied"])
        if "blocked" not in applied:
            raise SystemExit(f"enforce ledger must record action_applied=blocked, got {applied}")
        # Shadow path: same call, no enforce, must allow.
        env.pop("GURDY_ENFORCE")
        proc2 = subprocess.run(
            [sys.executable, str(HOOKS / "before_read_file.py")],
            input=json.dumps(
                {
                    "hook_event_name": "beforeReadFile",
                    "file_path": str(Path.home() / ".ssh" / "id_rsa"),
                    "conversation_id": "test",
                    "user_email": "dev@example.com",
                }
            ).encode(),
            capture_output=True,
            env=env,
            timeout=20,
        )
        out2 = json.loads(proc2.stdout.decode().strip().splitlines()[-1])
        if out2.get("permission") != "allow":
            raise SystemExit(f"shadow must allow, got {out2}")

        # The file is Act, not process lifetime. Same interpreter, two calls.
        env.pop("GURDY_ENFORCE", None)
        flag = Path(tmp) / "state" / "enforce"
        check = subprocess.run(
            [
                sys.executable,
                "-c",
                "from pathlib import Path\n"
                "from govern import STATE_DIR, enforce_on\n"
                "flag = STATE_DIR / 'enforce'\n"
                "assert not enforce_on(), 'empty start'\n"
                "flag.parent.mkdir(parents=True, exist_ok=True)\n"
                "flag.write_text('')\n"
                "assert enforce_on(), 'file on'\n"
                "flag.unlink()\n"
                "assert not enforce_on(), 'file off'\n",
            ],
            cwd=str(HOOKS),
            env=env,
            capture_output=True,
            timeout=10,
        )
        if check.returncode != 0:
            sys.stderr.write(check.stderr.decode())
            raise SystemExit(f"enforce_on re-read failed: {check.stdout.decode()}")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
