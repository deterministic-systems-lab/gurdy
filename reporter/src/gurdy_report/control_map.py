"""Load and validate ``control_map.yaml``.

A control map is justification: which operational policies were written to
support which framework control IDs. It is not a conformity assessment.
Status is derived from a verified ledger later; nothing in this file may
say that an organization is compliant.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .yaml_lite import YAMLError, load as load_yaml

FRAMEWORK_IDS = frozenset({"nist-ai-rmf", "iso-42001", "eu-ai-act"})
EVIDENCE_KINDS = frozenset({"ledger", "pack", "policy_fire", "enforcement"})
STATUSES = frozenset({"evidenced", "partial", "not-in-scope", "unverified"})

REPO_MAP = Path(__file__).resolve().parents[3] / "policy" / "control_map.yaml"


class ControlMapError(ValueError):
    """The map is missing, unreadable, or not a map this reporter will project."""


@dataclass(frozen=True)
class ControlRow:
    framework: str
    control_id: str
    title: str
    statement: str
    justification: str
    evidence: str
    reason: str = ""

    @property
    def out_of_scope(self) -> bool:
        return self.evidence == ""


@dataclass(frozen=True)
class PolicyRow:
    policy_id: str
    statement: str
    maps: tuple[ControlRow, ...]


@dataclass(frozen=True)
class ControlMap:
    schema_version: int
    pack_id: str
    disclaimer: str
    frameworks: dict[str, str]
    pack_controls: tuple[ControlRow, ...]
    policies: tuple[PolicyRow, ...]
    out_of_scope: tuple[ControlRow, ...]
    path: str

    def name(self, framework: str) -> str:
        return self.frameworks.get(framework, framework)

    def policy_ids(self) -> frozenset[str]:
        return frozenset(p.policy_id for p in self.policies)

    def policies_for(self, framework: str, control_id: str) -> tuple[PolicyRow, ...]:
        return tuple(
            p
            for p in self.policies
            if any(m.framework == framework and m.control_id == control_id for m in p.maps)
        )


def resolve_map_path(explicit: Path | None = None) -> Path:
    if explicit is not None:
        return explicit
    env = os.environ.get("GURDY_CONTROL_MAP")
    if env:
        return Path(env)
    for start in (Path.cwd(), Path(__file__).resolve().parent):
        found = _find_up(start)
        if found is not None:
            return found
    if REPO_MAP.is_file():
        return REPO_MAP
    raise ControlMapError(
        "no control_map.yaml found. Pass --control-map or set GURDY_CONTROL_MAP"
    )


def _find_up(start: Path) -> Path | None:
    for parent in [start, *start.parents]:
        candidate = parent / "policy" / "control_map.yaml"
        if candidate.is_file():
            return candidate
    return None


def load_map(path: Path) -> ControlMap:
    if not path.is_file():
        raise ControlMapError(f"{path} is not a file")
    try:
        raw = load_yaml(path.read_text(encoding="utf-8"))
    except YAMLError as exc:
        raise ControlMapError(f"{path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ControlMapError(f"{path}: document must be a mapping")
    return _parse(raw, str(path))


def _parse(raw: dict, path: str) -> ControlMap:
    version = raw.get("schema_version")
    if version != 1:
        raise ControlMapError(f"{path}: schema_version must be 1")
    pack_id = _req_str(raw, "pack_id", path)
    disclaimer = _req_str(raw, "disclaimer", path)
    if "compliant" in disclaimer.lower() and "not" not in disclaimer.lower():
        raise ControlMapError(
            f"{path}: disclaimer must refuse a compliance claim, not make one"
        )
    frameworks = raw.get("frameworks")
    if not isinstance(frameworks, dict) or not frameworks:
        raise ControlMapError(f"{path}: frameworks must be a non-empty mapping")
    names: dict[str, str] = {}
    for fid, name in frameworks.items():
        if fid not in FRAMEWORK_IDS:
            raise ControlMapError(f"{path}: unknown framework {fid!r}")
        if not isinstance(name, str) or not name.strip():
            raise ControlMapError(f"{path}: framework {fid} needs a name")
        names[fid] = name.strip()

    pack_controls = tuple(
        _control(row, path, require_evidence=True)
        for row in _list(raw, "pack_controls", path)
    )
    policies = tuple(_policy(row, path) for row in _list(raw, "policies", path))
    out_of_scope = tuple(
        _control(row, path, require_evidence=False)
        for row in _list(raw, "out_of_scope", path)
    )
    if not pack_controls:
        raise ControlMapError(f"{path}: pack_controls must not be empty")
    return ControlMap(
        schema_version=1,
        pack_id=pack_id,
        disclaimer=disclaimer,
        frameworks=names,
        pack_controls=pack_controls,
        policies=policies,
        out_of_scope=out_of_scope,
        path=path,
    )


def _list(raw: dict, key: str, path: str) -> list:
    val = raw.get(key, [])
    if not isinstance(val, list):
        raise ControlMapError(f"{path}: {key} must be a list")
    return val


def _req_str(raw: dict, key: str, path: str) -> str:
    val = raw.get(key)
    if not isinstance(val, str) or not val.strip():
        raise ControlMapError(f"{path}: {key} must be a non-empty string")
    return val.strip()


def _control(raw: object, path: str, *, require_evidence: bool) -> ControlRow:
    if not isinstance(raw, dict):
        raise ControlMapError(f"{path}: control row must be a mapping")
    framework = _req_str(raw, "framework", path)
    if framework not in FRAMEWORK_IDS:
        raise ControlMapError(f"{path}: unknown framework {framework!r}")
    evidence = raw.get("evidence", "")
    if require_evidence:
        if evidence not in EVIDENCE_KINDS:
            raise ControlMapError(f"{path}: evidence must be one of {sorted(EVIDENCE_KINDS)}")
        reason = ""
    else:
        if evidence not in ("", None):
            raise ControlMapError(f"{path}: out_of_scope rows must not set evidence")
        evidence = ""
        reason = _req_str(raw, "reason", path)
    return ControlRow(
        framework=framework,
        control_id=_req_str(raw, "control_id", path),
        title=_req_str(raw, "title", path),
        statement=str(raw.get("statement") or "").strip(),
        justification=str(raw.get("justification") or "").strip(),
        evidence=str(evidence),
        reason=reason,
    )


def _policy(raw: object, path: str) -> PolicyRow:
    if not isinstance(raw, dict):
        raise ControlMapError(f"{path}: policy row must be a mapping")
    maps = tuple(
        _control(row, path, require_evidence=True) for row in _list(raw, "maps", path)
    )
    if not maps:
        raise ControlMapError(f"{path}: policy {_req_str(raw, 'id', path)} has no maps")
    return PolicyRow(
        policy_id=_req_str(raw, "id", path),
        statement=_req_str(raw, "statement", path),
        maps=maps,
    )


def assert_pack_ids(cmap: ControlMap, pack_ids: set[str]) -> None:
    """Every mapped policy_id must be a pack policy. Extra pack ids are allowed."""
    unknown = sorted(cmap.policy_ids() - pack_ids)
    if unknown:
        raise ControlMapError(
            f"{cmap.path}: mapped policy id(s) not in the pack: {', '.join(unknown)}"
        )
