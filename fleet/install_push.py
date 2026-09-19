#!/usr/bin/env python3
"""Install the periodic shipper: launchd on macOS, systemd --user on Linux.

Does not touch Cursor hooks. Failures stay in ~/.gurdy/push.log.
Requires ~/.gurdy/push.env with GURDY_DASHBOARD_URL and GURDY_DEVICE_TOKEN.
"""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

LAUNCHD_LABEL = "com.gurdy.push"

# launchd (and a systemd user unit started at login) cannot read or execute
# files under Documents / Desktop / Downloads. The overlay checkout often
# lives there, and the timer then dies with "Operation not permitted" before
# ship.py runs. Stage a copy under ~/.gurdy, which is not in that set.
STAGED_NAME = "staged"
STAGED_FILES = (
    "fleet/gurdy-push.sh",
    "fleet/ship.py",
    "adapters/cursor/hooks/policy_path.py",
    "adapters/cursor/hooks/root.py",
    "bin/gurdy-verify",
    "bin/gurdy-proxy",
    "policy/pack.cedar",
    "adapters/cursor/servers.json",
)
REQUIRED_STAGED = (
    "fleet/gurdy-push.sh",
    "fleet/ship.py",
    "adapters/cursor/hooks/policy_path.py",
)


def write_env(gurdy: Path, url: str, token: str) -> Path:
    env_path = gurdy / "push.env"
    if url and token:
        env_path.write_text(
            f"GURDY_DASHBOARD_URL={url}\nGURDY_DEVICE_TOKEN={token}\n",
            encoding="utf-8",
        )
        os.chmod(env_path, 0o600)
        print(f"wrote {env_path}")
    elif not env_path.exists():
        env_path.write_text(
            "GURDY_DASHBOARD_URL=\nGURDY_DEVICE_TOKEN=\n",
            encoding="utf-8",
        )
        os.chmod(env_path, 0o600)
        print(f"wrote empty {env_path} — fill it in before the first push")
    return env_path


def _launchctl(*args: str) -> subprocess.CompletedProcess[str]:
    """launchctl with its output captured, so the caller decides what is news."""
    return subprocess.run(
        ["launchctl", *args], check=False, capture_output=True, text=True
    )


def stage_shipper(root: Path, gurdy: Path) -> Path:
    """Copy the files the timer needs into gurdy/staged, then return that dir."""
    staged = gurdy / STAGED_NAME
    for rel in STAGED_FILES:
        src = root / rel
        if not src.is_file():
            if rel in REQUIRED_STAGED:
                raise SystemExit(f"stage_shipper: missing {src}")
            continue
        dest = staged / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        if rel.endswith(".sh") or rel.startswith("bin/"):
            dest.chmod(dest.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return staged


def push_script(root: Path, gurdy: Path) -> Path:
    return stage_shipper(root, gurdy) / "fleet" / "gurdy-push.sh"


def install_launchd(root: Path, gurdy: Path) -> None:
    push = push_script(root, gurdy)
    template = (root / "fleet" / f"{LAUNCHD_LABEL}.plist.template").read_text(
        encoding="utf-8"
    )
    plist = template.replace("__PUSH_SH__", str(push)).replace(
        "__LOG__", str(gurdy / "push.log")
    )
    dest = Path.home() / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(plist, encoding="utf-8")

    domain = f"gui/{os.getuid()}"
    # On a first install there is nothing to remove, so this is expected to
    # fail. launchctl reports that on stderr; capturing keeps it off the
    # terminal, where it read as a failed install.
    _launchctl("bootout", f"{domain}/{LAUNCHD_LABEL}")
    for attempt in range(3):
        loaded = _launchctl("bootstrap", domain, str(dest))
        if loaded.returncode == 0:
            break
        if attempt < 2:
            # bootout can still be settling; the next bootstrap usually takes.
            time.sleep(0.5)
    else:
        _launchctl("unload", str(dest))
        loaded = _launchctl("load", str(dest))

    if _launchctl("print", f"{domain}/{LAUNCHD_LABEL}").returncode != 0:
        detail = (loaded.stderr or loaded.stdout).strip()
        raise SystemExit(
            f"launchd did not accept {dest}{': ' + detail if detail else ''}"
        )
    print(f"loaded {dest}")
    print(f"timer: {push}")
    print(f"log: {gurdy / 'push.log'}")


def install_systemd(root: Path, gurdy: Path) -> None:
    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    push = str(push_script(root, gurdy))
    service = (root / "scripts" / "gurdy-push.service.template").read_text(
        encoding="utf-8"
    ).replace("__PUSH_SH__", push)
    (unit_dir / "gurdy-push.service").write_text(service, encoding="utf-8")
    timer = (root / "scripts" / "gurdy-push.timer").read_text(encoding="utf-8")
    (unit_dir / "gurdy-push.timer").write_text(timer, encoding="utf-8")
    enabled = subprocess.run(
        ["systemctl", "--user", "enable", "--now", "gurdy-push.timer"],
        check=False,
    )
    if enabled.returncode != 0:
        print("wrote systemd user units; run: systemctl --user enable --now gurdy-push.timer")
        print("if the timer dies at logout: sudo loginctl enable-linger $USER")
        return
    print(f"enabled {unit_dir / 'gurdy-push.timer'}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--url", default="", help="GURDY_DASHBOARD_URL to write into push.env")
    ap.add_argument("--token", default="", help="GURDY_DEVICE_TOKEN to write into push.env")
    args = ap.parse_args()

    home = Path.home()
    gurdy = home / ".gurdy"
    gurdy.mkdir(parents=True, exist_ok=True)
    write_env(gurdy, args.url, args.token)

    if sys.platform == "darwin":
        install_launchd(args.root, gurdy)
    elif sys.platform.startswith("linux"):
        install_systemd(args.root, gurdy)
        print(f"log: journalctl --user -u gurdy-push.service")
    else:
        print("no timer on this OS; run scripts/gurdy-push.sh from cron")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
