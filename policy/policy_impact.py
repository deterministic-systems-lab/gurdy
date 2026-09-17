#!/usr/bin/env python3
"""Offline Cedar pack comparison for Leo.

Replay each stdio corpus trace against the current pack and candidate .cedar
files (what IT/security would send). First --pack is in force; the rest are
candidates. Does not touch live traffic or ~/.gurdy.

Case 03 is HTTP-only (no tool name) and is skipped the same way as replay_corpus.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from replay_corpus import replay_stdio

ROOT = Path(__file__).resolve().parent.parent


def _hash12(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def _shown(path: Path) -> str:
    """Repo-relative, so the report reads the same whoever ran it.

    `make impact` passes absolute paths and the command in the header passes
    relative ones. Both name the same file, and a home directory in a tracked
    report is only churn. A candidate from outside the clone keeps its path.
    """
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(resolved)


def _ids(decision: dict) -> list[str]:
    if decision.get("policy_ids"):
        return list(decision["policy_ids"])
    return [e.get("policy_id") for e in decision.get("policy_effects") or [] if e.get("policy_id")]


def _one(proxy: Path, policy: Path, case: dict) -> dict:
    result = replay_stdio(proxy, policy, case)
    if not result["decisions"]:
        err = (result.get("stderr") or "").strip()[-400:]
        raise RuntimeError(f"no decision record for {policy.name}: {err}")
    d = result["decisions"][0]
    return {
        "decision": d.get("decision") or "?",
        "ids": _ids(d),
        "action_applied": d.get("action_applied"),
    }


def _label(path: Path) -> str:
    return path.stem


def _pair_counts(rows: list[dict], packs: list[Path]) -> list[tuple[str, str, int, int]]:
    """(from_label, to_label, allow_to_block, block_to_allow) per adjacent pair."""
    out = []
    for i in range(len(packs) - 1):
        a, b = _label(packs[i]), _label(packs[i + 1])
        a2b = sum(1 for r in rows if r["decisions"][i] == "allow" and r["decisions"][i + 1] == "block")
        b2a = sum(1 for r in rows if r["decisions"][i] == "block" and r["decisions"][i + 1] == "allow")
        out.append((a, b, a2b, b2a))
    return out


def _changed(decisions: list[str]) -> str:
    steps = []
    for i in range(len(decisions) - 1):
        if decisions[i] != decisions[i + 1]:
            steps.append(f"{decisions[i]}→{decisions[i + 1]}")
    return ", ".join(steps) if steps else "no"


def render(rows: list[dict], packs: list[Path]) -> str:
    labels = [_label(p) for p in packs]
    title = " → ".join(labels)
    lines = [
        f"# Policy impact: {title}",
        "",
        "Offline replay: current pack first, then the candidate file(s) IT/security sent.",
        "Not live traffic. Stopped count is still 0 until enforce is on (`action_applied=forwarded`).",
        "",
    ]
    for p in packs:
        lines.append(f"- `{_shown(p)}` `file:{_hash12(p)}`")
    header = ["trace", "call", *labels, "changed"]
    lines += ["", "| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    for r in rows:
        changed = _changed(r["decisions"])
        if changed != "no":
            changed = f"**{changed}**"
        cells = [r["trace"], r["call"], *r["decisions"], changed]
        lines.append("| " + " | ".join(cells) + " |")
    lines += ["", "**Summary (current → candidate):**"]
    for a, b, a2b, b2a in _pair_counts(rows, packs):
        lines.append(f"- `{a}` → `{b}`: {a2b} allow→block, {b2a} block→allow")
    lines += [
        "",
        "Case `03-unlisted-model-host` is HTTP-only and is not in this table",
        "(same skip as `make corpus`; `scripts/seed_ledger.py` covers the current pack).",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy", type=Path, required=True)
    ap.add_argument(
        "--pack",
        action="append",
        dest="packs",
        type=Path,
        help="Cedar file. First is current; later are candidates. Repeatable.",
    )
    ap.add_argument("--cases", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    packs = args.packs or []
    if len(packs) < 2:
        ap.error("pass at least two --pack files (current, then the candidate)")

    rows: list[dict] = []
    for path in sorted(args.cases.glob("*.json")):
        case_d = json.loads(path.read_text(encoding="utf-8"))
        call = case_d["steps"][0]["call"]
        if "tool" not in call:
            print(f"SKIP  {path.name}  (not a stdio tools/call)")
            continue
        verdicts = [_one(args.proxy, p, case_d) for p in packs]
        decisions = [v["decision"] for v in verdicts]
        call_s = f"{call['tool']} {call.get('args', {}).get('path', '')}".strip()
        rows.append({"trace": path.stem, "call": call_s, "decisions": decisions})
        bits = "  ".join(
            f"{_label(p)}={v['decision']}" for p, v in zip(packs, verdicts)
        )
        print(f"{path.name:28} {bits}  changed={_changed(decisions)}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(rows, packs), encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
