"""Project a verified ledger through a control map.

Status is evidenced, partial, not-in-scope, or unverified. None of those
is a pass, and none may be the word compliant. Narratives are templates
over decision fields — the same export always produces the same bytes.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass
from pathlib import Path

from .claims import Claim
from .control_map import ControlMap, ControlRow, PolicyRow
from .ledger import Decision, LedgerData
from .verify import Verification

STOPPED = frozenset({"blocked", "rewritten"})
FLAGGED = frozenset({"flag", "block"})


@dataclass(frozen=True)
class ControlFinding:
    framework: str
    control_id: str
    title: str
    status: str
    text: str
    refs: tuple[str, ...]
    caveat: str
    absent_because: str
    policies: tuple[str, ...]

    def claim(self) -> Claim:
        label = f"{self.control_id} ({self.title}): {self.status}."
        body = f"{label} {self.text}".rstrip()
        if self.absent_because:
            return Claim.absence(body, because=self.absent_because, caveat=self.caveat)
        return Claim(body, refs=self.refs, caveat=self.caveat)


def apply(report, data: LedgerData, ver: Verification, framework: str, cmap: ControlMap) -> None:
    """Append the framework section. Caller must only invoke this on a reportable export."""
    report.framework_id = framework
    report.framework_name = cmap.name(framework)
    s = report.section(f"Framework map — {cmap.name(framework)}")
    s.add(
        Claim.absence(
            cmap.disclaimer,
            because=(
                "framework status is a projection of this export through "
                f"{Path(cmap.path).name}, not an audit of the organization's program"
            ),
        )
    )

    findings = list(_findings(data, ver, framework, cmap))
    report.control_findings = findings
    for finding in findings:
        s.add(finding.claim())


def _findings(
    data: LedgerData, ver: Verification, framework: str, cmap: ControlMap
) -> list[ControlFinding]:
    seen: set[str] = set()
    out: list[ControlFinding] = []
    for row in cmap.pack_controls:
        if row.framework != framework or row.control_id in seen:
            continue
        seen.add(row.control_id)
        out.append(_evaluate(row, data, ver, cmap.policies_for(framework, row.control_id)))
    for row in cmap.out_of_scope:
        if row.framework != framework or row.control_id in seen:
            continue
        seen.add(row.control_id)
        out.append(_out_of_scope(row))
    return out


def _out_of_scope(row: ControlRow) -> ControlFinding:
    return ControlFinding(
        framework=row.framework,
        control_id=row.control_id,
        title=row.title,
        status="not-in-scope",
        text=row.reason,
        refs=(),
        caveat="stated as absence, not as zero findings",
        absent_because=row.reason,
        policies=(),
    )


def _evaluate(
    row: ControlRow,
    data: LedgerData,
    ver: Verification,
    policies: tuple[PolicyRow, ...],
) -> ControlFinding:
    names = tuple(p.policy_id for p in policies)
    if row.evidence == "ledger":
        return _ledger(row, data, ver, names)
    if row.evidence == "pack":
        return _pack(row, data, names)
    return _policy_effect(row, data, names, want_enforcement=row.evidence == "enforcement")


def _ledger(
    row: ControlRow, data: LedgerData, ver: Verification, policies: tuple[str, ...]
) -> ControlFinding:
    refs = _decision_refs(data.decisions) or _export_refs(ver)
    incomplete = _incomplete(ver)
    if not data.decisions:
        return ControlFinding(
            framework=row.framework,
            control_id=row.control_id,
            title=row.title,
            status="partial",
            text=(
                "The export verified and contains no decision records. Record-keeping "
                "of intercepted calls is unexercised on this slice."
            ),
            refs=refs,
            caveat="a verified empty-of-decisions export is not the same as a proxy that never ran",
            absent_because="" if refs else "this export contains no decision records",
            policies=policies,
        )
    status = "partial" if incomplete else "evidenced"
    caveat = (
        "counts are over records written; traffic that never reached the proxy is absent"
    )
    if incomplete:
        caveat += ". coverage gaps or an unsigned tail make every count a floor"
    return ControlFinding(
        framework=row.framework,
        control_id=row.control_id,
        title=row.title,
        status=status,
        text=(
            f"This verified export holds {len(data.decisions)} decision record(s) of "
            f"intercepted agent tool calls."
        ),
        refs=refs,
        caveat=caveat,
        absent_because="",
        policies=policies,
    )


def _pack(row: ControlRow, data: LedgerData, policies: tuple[str, ...]) -> ControlFinding:
    if not data.decisions:
        return ControlFinding(
            framework=row.framework,
            control_id=row.control_id,
            title=row.title,
            status="partial",
            text="No governed calls were recorded, so pack-in-force cannot be shown on this slice.",
            refs=(),
            caveat="the map lists the starter policies; an export without decisions cannot prove they loaded",
            absent_because="this export contains no decision records",
            policies=policies,
        )
    bundles = sorted({d.bundle_ver or "(unrecorded)" for d in data.decisions})
    fired = _fired_counts(data.decisions, policies)
    fired_txt = (
        ", ".join(f"{pid} ×{n}" for pid, n in fired.most_common())
        if fired
        else "none of the mapped starter policies fired"
    )
    missing = [d for d in data.decisions if not d.bundle_ver]
    status = "partial" if missing or not fired else "evidenced"
    caveat = "operational pack in force, not the organization's management-system policy"
    if missing:
        caveat += "; some decisions record no bundle_ver"
    return ControlFinding(
        framework=row.framework,
        control_id=row.control_id,
        title=row.title,
        status=status,
        text=(
            f"Bundle {', '.join(bundles)} decided {len(data.decisions)} call(s). "
            f"Mapped policies that contributed: {fired_txt}."
        ),
        refs=_decision_refs(data.decisions),
        caveat=caveat,
        absent_because="",
        policies=policies,
    )


def _policy_effect(
    row: ControlRow,
    data: LedgerData,
    policies: tuple[str, ...],
    *,
    want_enforcement: bool,
) -> ControlFinding:
    matching = [d for d in data.decisions if _matched(d, policies)]
    if not matching:
        return ControlFinding(
            framework=row.framework,
            control_id=row.control_id,
            title=row.title,
            status="partial",
            text=(
                "No recorded call was decided by a mapped policy. Control effectiveness "
                "on this slice is unexercised."
            ),
            refs=(),
            caveat="a policy that never matched and a policy that never loaded look identical here",
            absent_because="no decision record carries a mapped policy_id in policy_effects",
            policies=policies,
        )
    flagged = [d for d in matching if d.decision in FLAGGED]
    stopped = [d for d in matching if d.action_applied in STOPPED]
    failed_open = [d for d in matching if d.action_applied in ("failed-open", "failed_open")]
    by_policy = _fired_counts(matching, policies)
    policy_txt = ", ".join(f"{pid} ×{n}" for pid, n in by_policy.most_common())
    text = (
        f"{len(matching)} call(s) were decided by mapped policies ({policy_txt}): "
        f"{len(flagged)} flagged, {len(stopped)} stopped, {len(failed_open)} failed-open."
    )
    if want_enforcement:
        if stopped:
            status = "evidenced"
            caveat = (
                "decision is the policy conclusion; action_applied is what the actuator did. "
                "Stopped counts only action_applied blocked or rewritten"
            )
        else:
            status = "partial"
            caveat = (
                "monitor-only observation on this slice: mapped policies flagged calls "
                "and the actuator forwarded them. That is not an enforcement claim"
            )
    else:
        status = "evidenced"
        caveat = "contribution is not effectiveness; see the enforcement-mapped row for stopped counts"
    return ControlFinding(
        framework=row.framework,
        control_id=row.control_id,
        title=row.title,
        status=status,
        text=text,
        refs=_decision_refs(matching),
        caveat=caveat,
        absent_because="",
        policies=policies,
    )


def _matched(decision: Decision, policies: tuple[str, ...]) -> bool:
    want = set(policies)
    return any((eff.get("policy_id") or "") in want for eff in decision.policy_effects)


def _fired_counts(decisions: list[Decision], policies: tuple[str, ...]) -> collections.Counter:
    want = set(policies)
    counts: collections.Counter[str] = collections.Counter()
    for d in decisions:
        seen: set[str] = set()
        for eff in d.policy_effects:
            pid = eff.get("policy_id") or ""
            if pid in want and pid not in seen:
                counts[pid] += 1
                seen.add(pid)
    return counts


def _decision_refs(decisions: list[Decision]) -> tuple[str, ...]:
    return tuple(f"{d.source}:{d.seq}" for d in decisions)


def _export_refs(ver: Verification) -> tuple[str, ...]:
    refs: list[str] = []
    for e in ver.exports:
        if e.last_seq:
            refs.append(f"{Path(e.file).name}:{e.last_seq}")
    return tuple(refs)


def _incomplete(ver: Verification) -> bool:
    return any(
        e.dropped or e.write_errors or e.liveness_gaps or e.unclean_restarts or e.uncovered
        for e in ver.exports
    )
