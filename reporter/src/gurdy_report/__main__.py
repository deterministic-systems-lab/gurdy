"""CLI: ``gurdy-report <ledger-dir>``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .control_map import FRAMEWORK_IDS, ControlMapError, load_map, resolve_map_path
from .ledger import load as load_ledger
from .render import as_json, markdown
from .report import build
from .verify import VerifierUnavailable, verify


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="gurdy-report",
        description="Compile a Gurdy decision ledger into a local governance report (BR-11).",
    )
    ap.add_argument(
        "ledger_dir", type=Path, help="the export directory — what you would hand a reviewer"
    )
    ap.add_argument("-o", "--out", type=Path, help="write Markdown here instead of stdout")
    ap.add_argument("--json", type=Path, help="also write the machine-readable sibling here (§5.6)")
    ap.add_argument(
        "--pubkey",
        type=Path,
        help="pin the signing key. A third party should always pin: without it the key comes from "
        "the export itself, which confirms internal consistency but not provenance",
    )
    ap.add_argument("--verifier", default="gurdy-verify", help="path to the Go verifier")
    ap.add_argument(
        "--allow-unsigned-tail",
        action="store_true",
        help="report over trailing records no signature covers. For inspecting a LIVE ledger only: "
        "those records are forgeable by anyone with file access",
    )
    ap.add_argument(
        "--framework",
        choices=sorted(FRAMEWORK_IDS),
        help="project this export through the starter control map. Not a conformity assessment",
    )
    ap.add_argument(
        "--control-map",
        type=Path,
        help="control_map.yaml (defaults to GURDY_CONTROL_MAP or policy/control_map.yaml)",
    )
    args = ap.parse_args(argv)

    if not args.ledger_dir.is_dir():
        print(f"gurdy-report: {args.ledger_dir} is not a directory", file=sys.stderr)
        return 2

    try:
        ver = verify(
            args.ledger_dir,
            verifier=args.verifier,
            pubkey=args.pubkey,
            allow_unsigned_tail=args.allow_unsigned_tail,
        )
    except VerifierUnavailable as exc:
        # Not degradable, on purpose. Skipping verification would produce a
        # document that reads identically to a verified one.
        print(f"gurdy-report: {exc}", file=sys.stderr)
        return 2

    # Parse only what the verifier vouched for. Loading the directory
    # independently would let a file that appeared after verification feed
    # claims that nothing checked.
    data = load_ledger(args.ledger_dir, verified={Path(e.file).name for e in ver.exports})
    cmap = None
    if args.framework:
        try:
            cmap = load_map(resolve_map_path(args.control_map))
        except ControlMapError as exc:
            print(f"gurdy-report: {exc}", file=sys.stderr)
            return 2
        if args.framework not in cmap.frameworks:
            print(
                f"gurdy-report: control map {cmap.path} does not define {args.framework}",
                file=sys.stderr,
            )
            return 2
    rep = build(args.ledger_dir, data, ver, framework=args.framework, control_map=cmap)

    md = markdown(rep)
    if args.out:
        args.out.write_text(md, encoding="utf-8")
    else:
        sys.stdout.write(md)
    if args.json:
        args.json.write_text(as_json(rep), encoding="utf-8")

    # Nonzero when the export could not carry a report, so this composes into a
    # pipeline that must not silently accept an unusable ledger.
    return 0 if rep.reportable else 1


if __name__ == "__main__":
    raise SystemExit(main())
