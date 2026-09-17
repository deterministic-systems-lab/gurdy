"""Fleet shipper: ledger dirs → dashboard, only after gurdy-verify passes.

Does not reimplement verification. gurdy-verify is the single implementation
(Gurdy §3.3). A load that skipped it would put unverifiable rows next to
verifiable ones, and a reader of the table could not tell them apart.

Ships only the prefix through the last batchsig. A live ledger's open
signature window is unsigned and would fail the server's strict verify
(the verifier marks -allow-unsigned-tail as NEVER for a delivered export).
The open window arrives on the next run.

After ingest, applies GET /api/fleet/desired (cedar + enforce) and POSTs
a heartbeat so the estate view has actual, not only decision bundle_ver.

Runs do not overlap. launchd fires every 30 seconds and the installer ships
once in the foreground, so two runs used to read the same offsets and race
each other to POST them.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import platform
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "adapters" / "cursor" / "hooks"))

from policy_path import gurdy_home, resolve_policy  # noqa: E402

POLICY_FRAME = (
    b'{"jsonrpc":"2.0","id":1,"method":"tools/call",'
    b'"params":{"name":"read_file","arguments":{"path":"/tmp/x"}}}\n'
)


class DashboardError(Exception):
    def __init__(self, method: str, path: str, code: int, detail: str):
        self.method = method
        self.path = path
        self.code = code
        self.detail = detail
        # An empty body used to render as a bare trailing colon, which reads as
        # if the server explained itself and we dropped it.
        said = detail.strip() or "no response body, check the server log"
        super().__init__(f"dashboard {method} {path} failed ({code}): {said}")


def ledger_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    jsonl = list(root.glob("*.jsonl"))
    if jsonl:
        return [root]
    return sorted(p for p in root.iterdir() if p.is_dir() and list(p.glob("*.jsonl")))


TOKEN_PREFIX = "grd_"


def token_problem(token: str) -> str | None:
    """Why this cannot be a device token, or None.

    A token becomes an HTTP header, and headers are latin-1. Pasting the
    'grd_…' placeholder out of the docs put a U+2026 ellipsis in there and
    urllib raised UnicodeEncodeError from six frames down, which reads as a
    crash in the shipper rather than a typo in the command.
    """
    if not token.startswith(TOKEN_PREFIX):
        return (
            f"device token should start with {TOKEN_PREFIX}, got {token[:12]!r}. "
            "Mint one on the dashboard and pass that."
        )
    # Printable ASCII, not merely latin-1 encodable: a token is hex, and
    # something like an accented character would encode and then simply fail
    # to match, which is a worse way to find out. This matches the check in
    # install-push.sh so the two cannot disagree.
    if any(c < " " or c > "~" for c in token):
        return (
            "device token has characters that do not belong in one. "
            f"If you copied '{TOKEN_PREFIX}\u2026' from the instructions, that "
            "is a placeholder, not a token. Mint a real one on the dashboard."
        )
    return None


def signed_prefix(path: Path) -> bytes:
    """Bytes through the last batchsig line, verbatim, including newlines."""
    data = path.read_bytes()
    lines = data.splitlines(keepends=True)
    last = -1
    for i, line in enumerate(lines):
        rec = json.loads(line)
        if rec.get("kind") == "batchsig":
            last = i
    if last < 0:
        return b""
    return b"".join(lines[: last + 1])


# Ingest re-verifies the reconstructed prefix and inserts every new line in
# one request. A day of native hooks is bigger than that budget. Cut on a
# batchsig so each POST is still a verifiable prefix.
SHIP_CHUNK = 256 * 1024


def chunk_end(prefix: bytes, offset: int, max_bytes: int = SHIP_CHUNK) -> int:
    """Exclusive end of the next signed suffix, always on a batchsig line."""
    if offset >= len(prefix):
        return offset
    limit = min(len(prefix), offset + max_bytes)
    pos = 0
    last_in_window = offset
    first_after: int | None = None
    for line in prefix.splitlines(keepends=True):
        end = pos + len(line)
        rec = json.loads(line)
        if rec.get("kind") == "batchsig":
            if offset < end <= limit:
                last_in_window = end
            elif end > limit and offset < end and first_after is None:
                first_after = end
        pos = end
    if last_in_window > offset:
        return last_in_window
    if first_after is not None:
        return first_after
    return len(prefix)


def header_fields(prefix: bytes) -> tuple[str, str]:
    first = prefix.splitlines()[0]
    rec = json.loads(first)
    return str(rec["kid"]), str(rec.get("pubkey") or "")


def first_kid(root: Path) -> str | None:
    for d in ledger_dirs(root) or ([root] if root.exists() else []):
        for path in sorted(d.glob("*.jsonl")):
            try:
                rec = json.loads(path.read_text(encoding="utf-8").splitlines()[0])
            except (OSError, json.JSONDecodeError, IndexError):
                continue
            kid = rec.get("kid")
            if isinstance(kid, str) and kid:
                return kid
    return None


def ledger_names(root: Path) -> list[str]:
    names: list[str] = []
    if not root.exists():
        return names
    jsonl = list(root.glob("*.jsonl"))
    if jsonl:
        return [root.name]
    for p in sorted(root.iterdir()):
        if p.is_dir() and list(p.glob("*.jsonl")):
            names.append(p.name)
    return names


def partition_name(d: Path, path: Path, dirs: list[Path]) -> str:
    """Filename is unique per server dir; _proxy-{kid}.jsonl is not."""
    name = path.name
    hits = sum(1 for other in dirs if (other / name).is_file())
    if hits > 1:
        return f"{d.name}/{name}"
    return name


def verify(verifier: Path, target: Path) -> None:
    proc = subprocess.run(
        [str(verifier), "-json", str(target)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        raise SystemExit(f"gurdy-verify failed on {target} (exit {proc.returncode}); refusing to load")


def dashboard_request(
    url: str,
    token: str,
    method: str,
    path: str,
    body: dict | None = None,
) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url.rstrip("/") + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise DashboardError(method, path, exc.code, detail) from exc
    return json.loads(raw) if raw else {}


def offsets_from_server(url: str, token: str) -> dict[str, int]:
    payload = dashboard_request(url, token, "GET", "/api/ingest")
    out: dict[str, int] = {}
    for row in payload.get("partitions") or []:
        out[str(row["partition"])] = int(row["offset"])
    return out


def file_bundle_ver(raw: bytes) -> str:
    return "file:" + hashlib.sha256(raw).hexdigest()[:12]


def state_dir() -> Path:
    return Path(os.environ.get("GURDY_STATE_DIR", gurdy_home() / "state"))


def apply_enforce(want: bool) -> None:
    dest = state_dir()
    dest.mkdir(parents=True, exist_ok=True)
    flag = dest / "enforce"
    if want:
        flag.touch()
    else:
        flag.unlink(missing_ok=True)


def enforce_applied() -> bool:
    env = os.environ.get("GURDY_ENFORCE", "").lower() in {"1", "true", "yes"}
    return env or (state_dir() / "enforce").is_file()


def load_check_policy(proxy: Path, path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ledger = Path(tmp) / "ledger"
        state = Path(tmp) / "state"
        ledger.mkdir()
        state.mkdir()
        proc = subprocess.run(
            [
                str(proxy),
                "-stdio",
                "-tenant",
                "local",
                "-deploy-id",
                "policy-pull",
                "-ledger-dir",
                str(ledger),
                "-state-dir",
                str(state),
                "-tis-socket",
                "off",
                "-policy",
                str(path),
                "--",
                "cat",
            ],
            input=POLICY_FRAME,
            capture_output=True,
            timeout=20,
        )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        raise SystemExit(f"pulled policy failed local load check:\n{err}")


def install_cedar(proxy: Path, cedar: str, ver: str) -> None:
    dest_dir = gurdy_home() / "policy"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "current.cedar"
    if dest.exists() and file_bundle_ver(dest.read_bytes()) == ver:
        print(f"policy up to date {ver}")
        return
    if not proxy.is_file():
        raise SystemExit(f"gurdy-proxy not found at {proxy}; needed to load-check pulled policy")
    # The proxy picks the format from the suffix: bundle.Load parses a path
    # ending in .cedar as Cedar text and anything else as a gzip tarball. These
    # two must keep the extension last, or the load check reads a bare pack as
    # a tarball and fails on the gzip header.
    incoming = dest_dir / "current.incoming.cedar"
    incoming.write_text(cedar, encoding="utf-8")
    if file_bundle_ver(incoming.read_bytes()) != ver:
        incoming.unlink(missing_ok=True)
        raise SystemExit("pulled cedar does not hash to the advertised bundle_ver")
    try:
        load_check_policy(proxy, incoming)
    except BaseException:
        # A rejected pack must not be left sitting next to the one in force.
        # SystemExit is not an Exception, so this catches BaseException.
        incoming.unlink(missing_ok=True)
        raise
    prev = dest_dir / "current.prev.cedar"
    if dest.exists():
        dest.replace(prev)
    incoming.replace(dest)
    print(f"installed policy {ver} at {dest}")


def pull_desired(url: str, token: str, proxy: Path) -> dict:
    try:
        payload = dashboard_request(url, token, "GET", "/api/fleet/desired")
    except DashboardError as exc:
        if exc.code != 404:
            raise
        try:
            payload = dashboard_request(url, token, "GET", "/api/policy/current")
        except DashboardError as fallback:
            if fallback.code == 404:
                payload = {"enforce": False}
            else:
                raise
        if "enforce" not in payload:
            payload = {**payload, "enforce": False}
    apply_enforce(bool(payload.get("enforce")))
    print(f"enforce file {'on' if payload.get('enforce') else 'off'}")
    cedar = payload.get("cedar")
    ver = payload.get("bundle_ver")
    if isinstance(cedar, str) and isinstance(ver, str) and cedar.strip():
        install_cedar(proxy, cedar, ver)
    else:
        print("no current policy on the dashboard")
    return payload


def detect_shipper() -> str:
    forced = os.environ.get("GURDY_SHIPPER")
    if forced:
        return forced[:32]
    if sys.platform == "darwin" and (
        Path.home() / "Library" / "LaunchAgents" / "com.gurdy.push.plist"
    ).is_file():
        return "launchd"
    if sys.platform.startswith("linux") and (
        Path.home() / ".config" / "systemd" / "user" / "gurdy-push.timer"
    ).is_file():
        return "systemd"
    return "manual"


def git_head(root: Path) -> str | None:
    proc = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()[:64] or None


def surfaces(root: Path) -> dict:
    mcp: list[str] = []
    http: list[str] = []
    path = root / "adapters" / "cursor" / "servers.json"
    if not path.is_file():
        path = root / "cursor" / "servers.json"
    if path.is_file():
        doc = json.loads(path.read_text(encoding="utf-8"))
        for name, spec in (doc.get("servers") or {}).items():
            if not isinstance(spec, dict):
                continue
            transport = spec.get("transport", "stdio")
            wrap = spec.get("wrap", transport == "stdio")
            if transport == "stdio" and wrap:
                mcp.append(str(name))
            elif transport in {"http", "sse", "streamable-http"} and wrap:
                http.append(str(name))
    return {"native": True, "mcp": mcp, "http": http}


def asserted_conversation() -> str | None:
    """Cursor conversation_id from the sidecar JSON, never the txn token.

    current.txn is a capability. current.json is the last-writer-wins claim.
    Heartbeat reports the id as asserted, not as observed principal.
    """
    path = gurdy_home() / "identity" / "current.json"
    if not path.is_file():
        return None
    try:
        rec = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    conv = rec.get("conversation_id")
    if not isinstance(conv, str):
        return None
    conv = conv.strip()[:128]
    if not conv or conv == "unknown":
        return None
    return conv


def send_heartbeat(url: str, token: str, kid: str | None, root: Path, ledger_root: Path) -> None:
    if not kid:
        print("skip heartbeat: no ledger kid (device not pinned)")
        return
    pol = resolve_policy(root)
    observed = file_bundle_ver(pol.read_bytes()) if pol.is_file() else None
    body = {
        "kid": kid,
        "hostname": platform.node().split(".")[0][:255],
        "os": sys.platform[:64],
        "shipper": detect_shipper(),
        "observed_bundle_ver": observed,
        "policy_path": str(pol),
        "enforce_applied": enforce_applied(),
        "ledgers": ledger_names(ledger_root),
        "surfaces": surfaces(root),
        "git_head": git_head(root),
        "asserted_conversation_id": asserted_conversation(),
    }
    try:
        dashboard_request(url, token, "POST", "/api/fleet/heartbeat", body)
    except DashboardError as exc:
        if exc.code == 409 or "device_not_pinned" in exc.detail:
            print("heartbeat skipped: device not pinned yet")
            return
        raise
    print(f"heartbeat {kid} bundle={observed} enforce={body['enforce_applied']}")


def mismatch_offset(exc: DashboardError) -> int | None:
    """The offset the server says it holds, from a 409 offset_mismatch body."""
    if exc.code != 409:
        return None
    try:
        body = json.loads(exc.detail)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(body, dict) or body.get("error") != "offset_mismatch":
        return None
    offset = body.get("offset")
    return offset if isinstance(offset, int) else None


def post_suffix(
    url: str,
    token: str,
    partition: str,
    kid: str,
    prefix: bytes,
    offset: int,
) -> dict:
    end = chunk_end(prefix, offset)
    if end <= offset:
        raise SystemExit(f"{partition}: no signed chunk after offset {offset}")
    result = dashboard_request(
        url,
        token,
        "POST",
        "/api/ingest",
        {
            "partition": partition,
            "offset": offset,
            "kid": kid,
            "bytes": prefix[offset:end].decode("utf-8"),
        },
    )
    return {**result, "from": offset}


def ship_partition(
    url: str,
    token: str,
    partition: str,
    kid: str,
    prefix: bytes,
    offset: int,
) -> dict:
    if offset > len(prefix):
        raise SystemExit(
            f"{partition}: server offset {offset} is past local signed prefix {len(prefix)} — "
            "a fork or a rewrite, not a retry"
        )
    if offset == len(prefix):
        return {"ok": True, "offset": offset, "from": offset, "skipped": True}
    try:
        return post_suffix(url, token, partition, kid, prefix, offset)
    except DashboardError as exc:
        moved = mismatch_offset(exc)
        if moved is None:
            raise
        # Another run shipped between our GET and our POST. The server's
        # offset is the authoritative one, so resend from there instead of
        # failing on work that already landed.
        if moved > len(prefix):
            raise SystemExit(
                f"{partition}: server offset {moved} is past local signed prefix {len(prefix)} — "
                "a fork or a rewrite, not a retry"
            ) from exc
        if moved == len(prefix):
            return {"ok": True, "offset": moved, "from": moved, "skipped": True}
        print(f"{partition}: another run reached {moved}, resending from there")
        return post_suffix(url, token, partition, kid, prefix, moved)


@contextlib.contextmanager
def ship_lock(path: Path) -> Iterator[bool]:
    """Hold the one-run-at-a-time lock, or report that another run has it.

    Two overlapping runs both read offsets and both POST them. The loser gets
    409 offset_mismatch on work the winner already did.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("w")
    try:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        yield True
    finally:
        handle.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ship")
    ap.add_argument(
        "--ledger",
        type=Path,
        default=Path.home() / ".gurdy" / "ledger",
        help="ledger dir, or a parent of per-server ledger dirs",
    )
    ap.add_argument(
        "--verifier",
        type=Path,
        default=None,
        help="gurdy-verify binary (default: ../bin/gurdy-verify)",
    )
    ap.add_argument(
        "--url",
        default=os.environ.get("GURDY_DASHBOARD_URL", ""),
        help="dashboard origin (or GURDY_DASHBOARD_URL)",
    )
    ap.add_argument(
        "--token",
        default=os.environ.get("GURDY_DEVICE_TOKEN", ""),
        help="device bearer token (or GURDY_DEVICE_TOKEN)",
    )
    ap.add_argument(
        "--proxy",
        type=Path,
        default=None,
        help="gurdy-proxy binary for the policy load check (default: ../bin/gurdy-proxy)",
    )
    args = ap.parse_args(argv)

    root = _ROOT
    verifier = args.verifier or (root / "bin" / "gurdy-verify")
    proxy = args.proxy or (root / "bin" / "gurdy-proxy")
    if not verifier.is_file():
        print(f"ship.py: verifier not found at {verifier}", file=sys.stderr)
        return 2
    if not args.url or not args.token:
        print("ship.py: --url/--token or GURDY_DASHBOARD_URL/GURDY_DEVICE_TOKEN required", file=sys.stderr)
        return 2
    problem = token_problem(args.token)
    if problem:
        print(f"ship.py: {problem}", file=sys.stderr)
        return 2

    with ship_lock(state_dir() / "ship.lock") as held:
        if not held:
            print("another ship run holds the lock; leaving this one to it")
            return 0
        return run(args, root, verifier, proxy)


def run(args: argparse.Namespace, root: Path, verifier: Path, proxy: Path) -> int:
    try:
        dirs = ledger_dirs(args.ledger)
        kid = first_kid(args.ledger)
        shipped = 0
        failed = False
        if not dirs:
            print(f"ship.py: no ledger files under {args.ledger}", file=sys.stderr)
        else:
            remote = offsets_from_server(args.url, args.token)
            for d in dirs:
                for path in sorted(d.glob("*.jsonl")):
                    try:
                        prefix = signed_prefix(path)
                        if not prefix:
                            print(f"skip {path.name}: no batchsig (open window only)")
                            continue
                        part_kid, _ = header_fields(prefix)
                        kid = kid or part_kid
                        with tempfile.TemporaryDirectory() as tmp:
                            export = Path(tmp) / path.name
                            export.write_bytes(prefix)
                            verify(verifier, export)
                        part = partition_name(d, path, dirs)
                        offset = remote.get(part, 0)
                        sent = False
                        while offset < len(prefix):
                            result = ship_partition(
                                args.url, args.token, part, part_kid, prefix, offset
                            )
                            new_offset = int(result.get("offset", offset))
                            sent_from = int(result.get("from", offset))
                            remote[part] = new_offset
                            if result.get("skipped"):
                                offset = new_offset
                                break
                            print(f"shipped {part}: offset {sent_from} → {new_offset}")
                            sent = True
                            if new_offset <= offset:
                                raise SystemExit(
                                    f"{part}: ingest did not advance past {offset}"
                                )
                            offset = new_offset
                        if sent:
                            shipped += 1
                        else:
                            print(f"up to date {part} @ {offset}")
                    except SystemExit as exc:
                        print(str(exc), file=sys.stderr)
                        failed = True
                    except DashboardError as exc:
                        # One partition must not cost the run its policy pull
                        # and heartbeat, which is what the estate view reads.
                        print(str(exc), file=sys.stderr)
                        failed = True
            print(f"shipped {shipped} partition(s)")

        try:
            pull_desired(args.url, args.token, proxy)
        except SystemExit as exc:
            print(str(exc), file=sys.stderr)
            failed = True
        send_heartbeat(args.url, args.token, kid, root, args.ledger)
    except DashboardError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
