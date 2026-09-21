"""Framework projection: cited status, never a compliance claim."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from gurdy_report import as_json, build, load_map, markdown
from gurdy_report.control_map import ControlMapError, assert_pack_ids, resolve_map_path
from gurdy_report.ledger import Decision, LedgerData
from gurdy_report.verify import Export, Verification
from gurdy_report.yaml_lite import YAMLError, load as load_yaml

MAP = Path(__file__).resolve().parents[2] / "policy" / "control_map.yaml"


def export(**kw) -> Export:
    base = dict(
        file="/x/acme_host-1.jsonl",
        ok=True,
        error="",
        records=10,
        decisions=4,
        answered=4,
        unmatched=0,
        batches=1,
        dropped=0,
        write_errors=0,
        identity_failed=0,
        clean_end=None,
        liveness_gaps=0,
        unclean_restarts=0,
        uncovered=0,
        unknown_kinds=0,
        tenant="acme",
        workload="host:1",
        instance_id="i#1",
        schema_version=1,
        kid="k",
        key_source="embedded",
        last_seq=10,
        head_hash="abc123",
    )
    base.update(kw)
    return Export(**base)


def decision(seq: int, **kw) -> Decision:
    base = dict(
        seq=seq,
        call_id=f"c{seq}",
        action="mcp/tools_call",
        tool="read_file",
        decision="allow",
        action_applied="forwarded",
        policy_mode="monitor",
        principal="svc:host:1",
        principal_tier="attested-coarse",
        assertion_status="absent",
        asserted_principal="",
        asserted_human_actor="",
        lineage=(),
        bundle_ver="v1",
        policy_effects=(),
        source="f.jsonl",
    )
    base.update(kw)
    return Decision(**base)


def data(*decisions: Decision, **kw) -> LedgerData:
    d = LedgerData(decisions=list(decisions))
    d.answered_calls = kw.get("answered", {(x.source, x.call_id) for x in decisions})
    d.coverage_refs = kw.get("coverage_refs", set())
    return d


def mapped_block(seq: int, **kw) -> Decision:
    effects = kw.pop(
        "policy_effects",
        ({"policy_id": "shadow-credential-read", "decision": "block", "mode": "monitor"},),
    )
    return decision(
        seq,
        decision="block",
        action_applied=kw.pop("action_applied", "forwarded"),
        policy_effects=effects,
        **kw,
    )


def report(ledger, *, framework: str = "eu-ai-act"):
    return build(
        Path("/x"),
        ledger,
        Verification(exports=(export(),), pinned=True),
        framework=framework,
        control_map=load_map(MAP),
    )


def test_the_committed_map_loads_and_names_every_starter_policy():
    cmap = load_map(MAP)
    assert cmap.pack_id == "starter"
    assert set(cmap.frameworks) == {"nist-ai-rmf", "iso-42001", "eu-ai-act"}
    assert cmap.policy_ids() == {
        "shadow-credential-read",
        "shadow-sensitive-write",
        "shadow-destructive-fs",
        "shadow-named-tools",
        "shadow-unlisted-model-host",
    }
    assert_pack_ids(
        cmap,
        {
            "shadow-credential-read",
            "shadow-sensitive-write",
            "shadow-destructive-fs",
            "shadow-named-tools",
            "shadow-unlisted-model-host",
        },
    )


def test_an_unknown_policy_id_is_rejected():
    cmap = load_map(MAP)
    with pytest.raises(ControlMapError, match="not in the pack"):
        assert_pack_ids(cmap, {"shadow-credential-read"})


def test_art_12_is_evidenced_on_a_verified_export_with_decisions():
    rep = report(data(decision(2)))
    art12 = next(f for f in rep.control_findings if f.control_id == "Art. 12")
    assert art12.status == "evidenced"
    assert "1 decision record" in art12.text
    out = markdown(rep)
    assert "Framework map — Regulation (EU) 2024/1689" in out
    assert "does not assert that an organization is compliant" in out
    assert "Art. 6 (Risk classification): not-in-scope" in out


def test_coverage_gaps_make_record_keeping_partial():
    ver = Verification(exports=(export(dropped=12),), pinned=True)
    rep = build(
        Path("/x"),
        data(decision(2), coverage_refs={"f.jsonl:7"}),
        ver,
        framework="iso-42001",
        control_map=load_map(MAP),
    )
    docinfo = next(f for f in rep.control_findings if f.control_id == "7.5")
    assert docinfo.status == "partial"
    assert "floor" in docinfo.caveat


def test_measure_23_is_partial_when_flags_were_forwarded():
    rep = report(data(mapped_block(2)), framework="nist-ai-rmf")
    measure = next(f for f in rep.control_findings if f.control_id == "MEASURE 2.3")
    assert measure.status == "partial"
    assert "1 flagged, 0 stopped" in measure.text
    assert "not an enforcement claim" in measure.caveat
    govern = next(f for f in rep.control_findings if f.control_id == "GOVERN 1.1")
    assert govern.status == "evidenced"
    assert "shadow-credential-read ×1" in govern.text


def test_measure_23_is_evidenced_when_a_call_was_stopped():
    rep = report(
        data(mapped_block(2, action_applied="blocked", policy_mode="enforce")),
        framework="nist-ai-rmf",
    )
    measure = next(f for f in rep.control_findings if f.control_id == "MEASURE 2.3")
    assert measure.status == "evidenced"
    assert "1 stopped" in measure.text


def test_unexercised_policies_are_partial_not_zero():
    rep = report(data(decision(2)), framework="nist-ai-rmf")
    measure = next(f for f in rep.control_findings if f.control_id == "MEASURE 2.3")
    assert measure.status == "partial"
    assert measure.absent_because
    assert "unexercised" in measure.text


def test_a_failed_chain_does_not_grow_a_framework_section():
    ver = Verification(
        exports=(export(ok=False, error="prev_hash mismatch — chain broken"),),
        pinned=True,
    )
    rep = build(
        Path("/x"),
        data(mapped_block(2)),
        ver,
        framework="eu-ai-act",
        control_map=load_map(MAP),
    )
    assert not rep.reportable
    assert rep.control_findings == []
    assert "Framework map" not in markdown(rep)


def test_json_sibling_carries_control_status_and_forbids_compliant():
    rep = report(data(mapped_block(2)), framework="nist-ai-rmf")
    payload = json.loads(as_json(rep))
    assert payload["framework"]["id"] == "nist-ai-rmf"
    assert "not a conformity assessment" in payload["framework"]["disclaimer"]
    statuses = {c["status"] for c in payload["framework"]["controls"]}
    assert statuses <= {"evidenced", "partial", "not-in-scope", "unverified"}
    assert "compliant" not in statuses
    blob = as_json(rep)
    assert '"status": "compliant"' not in blob
    for control in payload["framework"]["controls"]:
        assert control["refs"] or control["absent_because"]


def test_the_projection_is_deterministic():
    ledger = data(mapped_block(2), decision(4, tool="delete_file"))
    first = markdown(report(ledger, framework="nist-ai-rmf"))
    second = markdown(report(ledger, framework="nist-ai-rmf"))
    assert first == second


def test_resolve_map_path_uses_an_explicit_file(tmp_path, monkeypatch):
    monkeypatch.delenv("GURDY_CONTROL_MAP", raising=False)
    assert resolve_map_path(MAP) == MAP


def test_yaml_rejects_tabs():
    with pytest.raises(YAMLError, match="tabs"):
        load_yaml("foo:\n\tbar: 1\n")


def test_yaml_keeps_dotted_control_ids_as_strings():
    doc = load_yaml("control_id: 7.5\n")
    assert doc["control_id"] == "7.5"
