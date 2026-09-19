#!/usr/bin/env python3
"""controls.json is the pack; cedar is generated; classify reads aliases."""

from __future__ import annotations

import argparse
import json
import os
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "policy"))
sys.path.insert(0, str(ROOT / "adapters" / "cursor" / "hooks"))

from classify import classify  # noqa: E402
from controls import alias_for_command, is_credential_path, load  # noqa: E402
from pack import check, cmd_publish, render_cedar  # noqa: E402


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    doc = load()
    cedar = render_cedar(doc)

    if "GENERATED from policy/controls.json" not in cedar:
        raise SystemExit("cedar header missing generate banner")
    for glob in (e["glob"] for e in doc["credential_paths"]):
        if f'like "{glob}"' not in cedar:
            raise SystemExit(f"missing credential glob in cedar: {glob}")
    if "shadow-named-tools" not in cedar or 'context.tool == "http_fetch"' not in cedar:
        raise SystemExit("named-tools forbid missing http_fetch")
    if "shadow-sensitive-write" in cedar:
        raise SystemExit("empty write_paths must not emit a write forbid")
    if check() != 0:
        raise SystemExit("pack check failed (run: python3 policy/pack.py generate)")

    extra = dict(doc)
    extra["write_paths"] = [{"glob": "*/infra/prod/*", "note": "test"}]
    rendered = render_cedar(extra)
    if "shadow-sensitive-write" not in rendered:
        raise SystemExit("write_paths should emit shadow-sensitive-write")
    if 'like "*/infra/prod/*"' not in rendered:
        raise SystemExit("write glob missing from cedar")

    eq(is_credential_path("/Users/u/.ssh/id_rsa"), True, "ssh glob")
    eq(is_credential_path("/Users/u/.ssh"), True, "ssh dir")
    eq(is_credential_path("/Users/u/.ssh/"), True, "ssh dir slash")
    eq(is_credential_path("/workspace/readme.md"), False, "ordinary path")
    eq(alias_for_command("curl -s https://exfil.example")["tool"], "http_fetch", "curl alias")
    eq(alias_for_command("/usr/bin/wget https://exfil.example")["command"], "wget", "wget path")
    eq(alias_for_command("sudo nc -l 9")["command"], "nc", "sudo nc")
    eq(alias_for_command("echo hello"), None, "echo is not aliased")

    eq(
        classify(
            {
                "hook_event_name": "beforeShellExecution",
                "command": "curl -s https://exfil.example/drop",
            }
        ),
        {"tool": "http_fetch", "arguments": {"url": "https://exfil.example/drop"}},
        "curl classify",
    )
    eq(
        classify(
            {
                "hook_event_name": "beforeShellExecution",
                "command": "ncat 10.0.0.1 443",
            }
        )["tool"],
        "http_fetch",
        "ncat classify",
    )

    os.environ.pop("GURDY_ADMIN_TOKEN", None)
    os.environ.pop("GURDY_DASHBOARD_URL", None)
    eq(
        cmd_publish(argparse.Namespace(url="", token="", note="")),
        2,
        "publish without token",
    )

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def read(self):
            return b'{"ok":true,"bundle_ver":"file:deadbeefcaf0"}'

    def fake_urlopen(req, timeout=60):
        eq(req.full_url, "https://example.test/api/policy", "publish url")
        headers = {k.lower(): v for k, v in req.header_items()}
        eq(headers.get("authorization"), "Bearer gra_test", "publish bearer")
        body = json.loads(req.data.decode("utf-8"))
        if "permit (principal, action, resource);" not in body["cedar"]:
            raise SystemExit("publish body missing cedar")
        eq(body["note"], "pack.py publish", "publish note")
        eq(body["name"], "local", "publish name")
        return FakeResp()

    with patch("pack.urllib.request.urlopen", fake_urlopen):
        eq(
            cmd_publish(
                argparse.Namespace(url="https://example.test", token="gra_test", note="")
            ),
            0,
            "publish ok",
        )

    def boom(_req, timeout=60):
        raise HTTPError(
            "https://example.test/api/policy",
            403,
            "forbidden",
            hdrs={},
            fp=BytesIO(b'{"error":"forbidden"}'),
        )

    with patch("pack.urllib.request.urlopen", boom):
        eq(
            cmd_publish(
                argparse.Namespace(url="https://example.test", token="gra_test", note="")
            ),
            1,
            "publish 403",
        )

    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
