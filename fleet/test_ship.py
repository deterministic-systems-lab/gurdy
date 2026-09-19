"""Local checks for the signed-prefix gate. No dashboard required."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from ship import (
    DashboardError,
    apply_enforce,
    chunk_end,
    enforce_applied,
    file_bundle_ver,
    first_kid,
    header_fields,
    install_cedar,
    mismatch_offset,
    partition_name,
    token_problem,
    pull_desired,
    send_heartbeat,
    ship_lock,
    ship_partition,
    signed_prefix,
    surfaces,
)

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed-ledger"


def test_signed_prefix_ends_on_batchsig() -> None:
    files = sorted(SEED.glob("*.jsonl"))
    if not files:
        return
    for path in files:
        prefix = signed_prefix(path)
        assert prefix, path
        last = json.loads(prefix.splitlines()[-1])
        assert last["kind"] == "batchsig", path
        kid, pubkey = header_fields(prefix)
        assert kid
        assert pubkey


def test_file_bundle_ver_is_first_six_sha256_bytes() -> None:
    raw = (ROOT / "policy" / "pack.cedar").read_bytes()
    ver = file_bundle_ver(raw)
    assert ver.startswith("file:")
    assert len(ver) == len("file:") + 12


def test_seed_is_already_a_signed_prefix() -> None:
    for path in SEED.glob("*.jsonl"):
        assert signed_prefix(path) == path.read_bytes()


def test_first_kid_from_seed() -> None:
    if not any(SEED.glob("*.jsonl")):
        return
    kid = first_kid(SEED)
    assert kid
    assert len(kid) >= 8


def test_apply_enforce_creates_and_removes_flag() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_STATE_DIR"] = tmp
        os.environ.pop("GURDY_ENFORCE", None)
        try:
            apply_enforce(True)
            assert Path(tmp, "enforce").is_file()
            assert enforce_applied() is True
            apply_enforce(False)
            assert not Path(tmp, "enforce").is_file()
            assert enforce_applied() is False
            os.environ["GURDY_ENFORCE"] = "1"
            assert enforce_applied() is True
        finally:
            os.environ.pop("GURDY_STATE_DIR", None)
            os.environ.pop("GURDY_ENFORCE", None)


def test_pull_desired_applies_enforce_and_installs_cedar() -> None:
    cedar = "permit (principal, action, resource);\n"
    ver = file_bundle_ver(cedar.encode())
    payload = {"bundle_ver": ver, "cedar": cedar, "enforce": True}

    def fake_request(_url, _token, method, path, body=None):
        assert method == "GET"
        assert path == "/api/fleet/desired"
        return payload

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        os.environ["GURDY_STATE_DIR"] = str(Path(tmp) / "state")
        os.environ.pop("GURDY_ENFORCE", None)
        proxy = Path(tmp) / "gurdy-proxy"
        proxy.write_text("", encoding="utf-8")
        try:
            with patch("ship.dashboard_request", fake_request):
                with patch("ship.load_check_policy"):
                    pull_desired("https://example.test", "grd_x", proxy)
            assert (Path(tmp) / "state" / "enforce").is_file()
            dest = Path(tmp) / "policy" / "current.cedar"
            assert dest.is_file()
            assert dest.read_text(encoding="utf-8") == cedar
        finally:
            os.environ.pop("GURDY_HOME", None)
            os.environ.pop("GURDY_STATE_DIR", None)


def test_placeholder_token_is_caught_before_the_request() -> None:
    """'grd_…' pasted from the docs used to crash six frames down in urllib.

    A header is latin-1, so the U+2026 raised UnicodeEncodeError inside
    http.client and printed a traceback that looked like a bug in the shipper.
    """
    assert token_problem("grd_\u2026") is not None
    assert "placeholder" in token_problem("grd_\u2026")
    # Non-ascii anywhere in the token, not just the ellipsis.
    assert token_problem("grd_caf\u00e9") is not None

    problem = token_problem("notatoken")
    assert problem is not None and "grd_" in problem

    # A real token has nothing to say about it.
    assert token_problem("grd_" + "a1b2c3d4" * 8) is None


def test_load_check_gets_a_cedar_suffix() -> None:
    """The proxy reads the format off the suffix.

    bundle.Load parses a path ending in .cedar as Cedar text and treats every
    other name as a gzip tarball, so load-checking `current.cedar.incoming`
    failed on the gzip header for every pulled pack. The other tests patch
    load_check_policy out entirely, which is how that went unseen; this one
    keeps the path it was handed.
    """
    cedar = "permit (principal, action, resource);\n"
    ver = file_bundle_ver(cedar.encode())
    checked: list[Path] = []

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        proxy = Path(tmp) / "gurdy-proxy"
        proxy.write_text("", encoding="utf-8")
        try:
            with patch("ship.load_check_policy", lambda _proxy, path: checked.append(path)):
                install_cedar(proxy, cedar, ver)
            assert len(checked) == 1, checked
            assert checked[0].name.endswith(".cedar"), checked[0].name
            dest = Path(tmp) / "policy" / "current.cedar"
            assert dest.read_text(encoding="utf-8") == cedar
            # Nothing half-written is left behind next to the installed pack.
            leftovers = sorted(p.name for p in dest.parent.iterdir())
            assert leftovers == ["current.cedar"], leftovers
        finally:
            os.environ.pop("GURDY_HOME", None)


def test_rejected_pack_leaves_nothing_behind() -> None:
    """A failed load check used to leave its half-installed file on disk."""
    cedar = "permit (principal, action, resource);\n"
    ver = file_bundle_ver(cedar.encode())

    def reject(_proxy, _path):
        raise SystemExit("pulled policy failed local load check")

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        proxy = Path(tmp) / "gurdy-proxy"
        proxy.write_text("", encoding="utf-8")
        try:
            with patch("ship.load_check_policy", reject):
                try:
                    install_cedar(proxy, cedar, ver)
                except SystemExit:
                    pass
                else:
                    raise AssertionError("a rejected pack should stop the install")
            assert sorted(p.name for p in (Path(tmp) / "policy").iterdir()) == []
        finally:
            os.environ.pop("GURDY_HOME", None)


def test_rollback_copy_also_keeps_the_cedar_suffix() -> None:
    """The kept-last-good pack is only useful if the proxy can still read it."""
    first = "permit (principal, action, resource);\n"
    second = "forbid (principal, action, resource);\n"

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        proxy = Path(tmp) / "gurdy-proxy"
        proxy.write_text("", encoding="utf-8")
        try:
            with patch("ship.load_check_policy"):
                install_cedar(proxy, first, file_bundle_ver(first.encode()))
                install_cedar(proxy, second, file_bundle_ver(second.encode()))
            pol = Path(tmp) / "policy"
            assert (pol / "current.cedar").read_text(encoding="utf-8") == second
            prev = [p for p in pol.iterdir() if "prev" in p.name]
            assert len(prev) == 1, sorted(p.name for p in pol.iterdir())
            assert prev[0].name.endswith(".cedar"), prev[0].name
            assert prev[0].read_text(encoding="utf-8") == first
        finally:
            os.environ.pop("GURDY_HOME", None)


def test_surfaces_lists_wrapped_stdio() -> None:
    spec = surfaces(ROOT)
    assert spec["native"] is True
    assert "filesystem" in spec["mcp"]
    assert spec["http"] == []


def test_pull_desired_falls_back_to_policy_current() -> None:
    cedar = "permit (principal, action, resource);\n"
    ver = file_bundle_ver(cedar.encode())
    calls: list[str] = []

    def fake_request(_url, _token, method, path, body=None):
        calls.append(path)
        if path == "/api/fleet/desired":
            raise DashboardError(method, path, 404, "no fleet")
        assert path == "/api/policy/current"
        return {"bundle_ver": ver, "cedar": cedar}

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        os.environ["GURDY_STATE_DIR"] = str(Path(tmp) / "state")
        os.environ.pop("GURDY_ENFORCE", None)
        proxy = Path(tmp) / "gurdy-proxy"
        proxy.write_text("", encoding="utf-8")
        try:
            with patch("ship.dashboard_request", fake_request):
                with patch("ship.load_check_policy"):
                    pull_desired("https://example.test", "grd_x", proxy)
            assert calls == ["/api/fleet/desired", "/api/policy/current"]
            assert not (Path(tmp) / "state" / "enforce").is_file()
            assert (Path(tmp) / "policy" / "current.cedar").read_text(encoding="utf-8") == cedar
        finally:
            os.environ.pop("GURDY_HOME", None)
            os.environ.pop("GURDY_STATE_DIR", None)


def test_heartbeat_skips_unpinned_device() -> None:
    posted: dict = {}

    def fake_request(_url, _token, method, path, body=None):
        posted["path"] = path
        posted["body"] = body
        raise DashboardError(method, path, 409, '{"error":"device_not_pinned"}')

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["GURDY_HOME"] = tmp
        ledger = Path(tmp) / "seed-ledger"
        ledger.mkdir()
        (ledger / "part.jsonl").write_text("{}\n", encoding="utf-8")
        try:
            with patch("ship.dashboard_request", fake_request):
                send_heartbeat("https://example.test", "grd_x", "kid1", ROOT, ledger)
        finally:
            os.environ.pop("GURDY_HOME", None)
    assert posted["path"] == "/api/fleet/heartbeat"
    assert posted["body"]["kid"] == "kid1"
    assert posted["body"]["ledgers"] == ["seed-ledger"]
    assert posted["body"]["surfaces"]["native"] is True
    assert posted["body"]["asserted_conversation_id"] is None
    assert "user_email" not in posted["body"]


def test_heartbeat_asserted_conversation_from_sidecar() -> None:
    posted: dict = {}

    def fake_request(_url, _token, method, path, body=None):
        posted["body"] = body
        return {"ok": True}

    with tempfile.TemporaryDirectory() as tmp:
        ident = Path(tmp) / "identity"
        ident.mkdir()
        (ident / "current.json").write_text(
            json.dumps(
                {
                    "conversation_id": "chat-99",
                    "user_email": "not-the-principal@example.com",
                }
            ),
            encoding="utf-8",
        )
        (ident / "current.txn").write_text("txn-secret", encoding="utf-8")
        os.environ["GURDY_HOME"] = tmp
        ledger = Path(tmp) / "led"
        ledger.mkdir()
        try:
            with patch("ship.dashboard_request", fake_request):
                send_heartbeat("https://example.test", "grd_x", "kid1", ROOT, ledger)
        finally:
            os.environ.pop("GURDY_HOME", None)
    assert posted["body"]["asserted_conversation_id"] == "chat-99"
    assert "user_email" not in posted["body"]
    assert "txn-secret" not in json.dumps(posted["body"])


def test_push_timer_every_thirty_seconds() -> None:
    service = (ROOT / "fleet" / "gurdy-push.service.template").read_text(encoding="utf-8")
    timer = (ROOT / "fleet" / "gurdy-push.timer").read_text(encoding="utf-8")
    plist = (ROOT / "fleet" / "com.gurdy.push.plist.template").read_text(
        encoding="utf-8"
    )
    assert "ExecStart=/bin/sh __PUSH_SH__" in service
    assert "OnUnitActiveSec=30" in timer
    assert "OnUnitActiveSec=300" not in timer
    assert "<integer>30</integer>" in plist
    assert "<integer>300</integer>" not in plist


def test_partition_name_namespaces_colliding_proxy() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cursor = Path(tmp) / "cursor"
        filesystem = Path(tmp) / "filesystem"
        cursor.mkdir()
        filesystem.mkdir()
        shared = "_proxy-abc.jsonl"
        (cursor / shared).write_text("{}\n", encoding="utf-8")
        (filesystem / shared).write_text("{}\n", encoding="utf-8")
        (cursor / "only-here.jsonl").write_text("{}\n", encoding="utf-8")
        dirs = [cursor, filesystem]
        assert partition_name(cursor, cursor / shared, dirs) == f"cursor/{shared}"
        assert partition_name(filesystem, filesystem / shared, dirs) == f"filesystem/{shared}"
        assert partition_name(cursor, cursor / "only-here.jsonl", dirs) == "only-here.jsonl"


def test_chunk_end_cuts_on_batchsig() -> None:
    def rec(kind: str, n: int) -> bytes:
        return json.dumps({"kind": kind, "n": n, "pad": "x" * 20}).encode() + b"\n"

    prefix = rec("header", 0) + rec("decision", 1) + rec("batchsig", 2)
    prefix += rec("decision", 3) + rec("batchsig", 4)
    first = prefix.find(b"\n") + 1
    # Tiny window: still include the first batchsig, never a mid-record cut.
    end = chunk_end(prefix, 0, max_bytes=first)
    assert json.loads(prefix[:end].splitlines()[-1])["kind"] == "batchsig"
    assert json.loads(prefix[:end].splitlines()[-1])["n"] == 2
    rest = chunk_end(prefix, end, max_bytes=first)
    assert rest == len(prefix)
    assert json.loads(prefix[end:rest].splitlines()[-1])["n"] == 4
    assert chunk_end(prefix, len(prefix), max_bytes=8) == len(prefix)


def test_mismatch_offset_reads_only_its_own_409() -> None:
    assert mismatch_offset(DashboardError("POST", "/api/ingest", 409, '{"error":"offset_mismatch","offset":1421712}')) == 1421712
    # A different 409 is not a resend signal.
    assert mismatch_offset(DashboardError("POST", "/x", 409, '{"error":"device_not_pinned"}')) is None
    assert mismatch_offset(DashboardError("POST", "/x", 500, "boom")) is None
    assert mismatch_offset(DashboardError("POST", "/x", 409, "not json")) is None


def test_lost_race_resends_from_the_server_offset() -> None:
    """launchd fires every 30s, so a run can lose the offset to its own twin.

    The 409 carries the offset the server actually holds. Resending from
    there is the whole fix: the bytes are already in the local prefix.
    """
    prefix = b"".join(b'{"seq":%d}\n' % i for i in range(20))
    sent: list[int] = []

    def fake_request(_url, _token, _method, _path, body=None):
        sent.append(body["offset"])
        if len(sent) == 1:
            raise DashboardError(
                "POST", "/api/ingest", 409, '{"error":"offset_mismatch","offset":40}'
            )
        return {"ok": True, "offset": len(prefix)}

    with patch("ship.dashboard_request", fake_request):
        result = ship_partition("https://example.test", "grd_x", "p.jsonl", "kid1", prefix, 11)

    assert sent == [11, 40], sent
    assert result["offset"] == len(prefix)
    assert result["from"] == 40
    assert not result.get("skipped")


def test_lost_race_that_already_covered_us_is_not_a_resend() -> None:
    prefix = b"".join(b'{"seq":%d}\n' % i for i in range(5))
    calls: list[int] = []

    def fake_request(_url, _token, _method, _path, body=None):
        calls.append(body["offset"])
        raise DashboardError(
            "POST", "/api/ingest", 409, '{"error":"offset_mismatch","offset":%d}' % len(prefix)
        )

    with patch("ship.dashboard_request", fake_request):
        result = ship_partition("https://example.test", "grd_x", "p.jsonl", "kid1", prefix, 0)

    assert calls == [0], "the winner already shipped every byte we hold"
    assert result["skipped"] is True
    assert result["offset"] == len(prefix)


def test_server_ahead_of_local_prefix_still_refuses() -> None:
    """Resending must not paper over a fork. Past our bytes is not a retry."""
    prefix = b'{"seq":0}\n'

    def fake_request(_url, _token, _method, _path, body=None):
        raise DashboardError(
            "POST", "/api/ingest", 409, '{"error":"offset_mismatch","offset":999999}'
        )

    with patch("ship.dashboard_request", fake_request):
        try:
            ship_partition("https://example.test", "grd_x", "p.jsonl", "kid1", prefix, 0)
        except SystemExit as exc:
            assert "fork or a rewrite" in str(exc)
        else:
            raise AssertionError("an offset past the local prefix must not resend")


def test_second_run_does_not_ship_while_the_first_holds_the_lock() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        lock = Path(tmp) / "state" / "ship.lock"
        with ship_lock(lock) as first:
            assert first is True
            with ship_lock(lock) as second:
                assert second is False, "two runs must not ship at once"
        # Released, so the next run gets it.
        with ship_lock(lock) as third:
            assert third is True


if __name__ == "__main__":
    test_signed_prefix_ends_on_batchsig()
    test_seed_is_already_a_signed_prefix()
    test_file_bundle_ver_is_first_six_sha256_bytes()
    test_first_kid_from_seed()
    test_apply_enforce_creates_and_removes_flag()
    test_pull_desired_applies_enforce_and_installs_cedar()
    test_pull_desired_falls_back_to_policy_current()
    test_placeholder_token_is_caught_before_the_request()
    test_load_check_gets_a_cedar_suffix()
    test_rejected_pack_leaves_nothing_behind()
    test_rollback_copy_also_keeps_the_cedar_suffix()
    test_heartbeat_skips_unpinned_device()
    test_heartbeat_asserted_conversation_from_sidecar()
    test_surfaces_lists_wrapped_stdio()
    test_push_timer_every_thirty_seconds()
    test_partition_name_namespaces_colliding_proxy()
    test_chunk_end_cuts_on_batchsig()
    test_mismatch_offset_reads_only_its_own_409()
    test_lost_race_resends_from_the_server_offset()
    test_lost_race_that_already_covered_us_is_not_a_resend()
    test_server_ahead_of_local_prefix_still_refuses()
    test_second_run_does_not_ship_while_the_first_holds_the_lock()
    print("ok")
