#!/usr/bin/env python3
"""Replay corpus traces against gurdy-proxy -stdio -policy pack.cedar.

gurdy-conform always starts the proxy on the embedded starter pack and has no
-policy flag, so a custom pack cannot be judged by it. This harness is the
stdio equivalent: one JSON-RPC line, cat as the upstream, then the ledger.
Case 03 (llm/completion) is HTTP-only and is skipped here with an explicit
note — seed_ledger.py covers it in reverse-proxy mode.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def replay_stdio(proxy: Path, policy: Path, case: dict) -> dict:
    call = case["steps"][0]["call"]
    frame = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": call["tool"], "arguments": call.get("args") or {}},
    }
    line = json.dumps(frame, separators=(",", ":")) + "\n"
    with tempfile.TemporaryDirectory() as tmp:
        ledger = Path(tmp) / "ledger"
        state = Path(tmp) / "state"
        proc = subprocess.run(
            [
                str(proxy),
                "-stdio",
                "-tenant",
                "local",
                "-deploy-id",
                "corpus",
                "-ledger-dir",
                str(ledger),
                "-state-dir",
                str(state),
                "-tis-socket",
                "off",
                "-policy",
                str(policy),
                "--",
                "cat",
            ],
            input=line.encode(),
            capture_output=True,
            timeout=30,
        )
        recs = []
        if ledger.is_dir():
            for p in ledger.glob("*.jsonl"):
                for raw in p.read_text(encoding="utf-8").splitlines():
                    recs.append(json.loads(raw))
        decisions = [r for r in recs if r.get("kind") == "decision"]
        return {
            "stderr": proc.stderr.decode(errors="replace"),
            "decisions": decisions,
        }


def check(case: dict, got: list[dict]) -> list[str]:
    want = (case.get("expect") or {}).get("records") or []
    problems = []
    if len(got) < len(want):
        problems.append(f"wanted {len(want)} decision(s), got {len(got)}")
        return problems
    for w, g in zip(want, got):
        for k, v in w.items():
            if k == "policy":
                ids = g.get("policy_ids") or [
                    e.get("policy_id") for e in g.get("policy_effects") or []
                ]
                if v not in ids:
                    problems.append(f"policy {v} not in {ids}")
                continue
            if g.get(k) != v:
                problems.append(f"{k}: got {g.get(k)!r} want {v!r}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy", type=Path, required=True)
    ap.add_argument("--policy", type=Path, required=True)
    ap.add_argument("--cases", type=Path, required=True)
    args = ap.parse_args()

    failed = 0
    for path in sorted(args.cases.glob("*.json")):
        case = json.loads(path.read_text(encoding="utf-8"))
        call = case["steps"][0]["call"]
        if "tool" not in call:
            print(f"SKIP  {path.name}  (not a stdio tools/call; see seed_ledger.py)")
            continue
        result = replay_stdio(args.proxy, args.policy, case)
        problems = check(case, result["decisions"])
        if problems:
            failed += 1
            print(f"FAIL  {path.name}")
            for p in problems:
                print(f"      {p}")
            if result["stderr"]:
                print(result["stderr"][-800:])
        else:
            d = result["decisions"][0]
            print(f"PASS  {path.name}  decision={d.get('decision')} applied={d.get('action_applied')}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
