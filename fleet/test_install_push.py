#!/usr/bin/env python3
"""launchd wiring in install_push.py.

Legacy `launchctl load` prints its failure on stderr and still exits 0, so an
exit code is not evidence. These cases pin the two things that follow: the
expected first-install bootout is not shown to the user, and "loaded" is only
printed after `launchctl print` confirms the job.
"""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import install_push

ROOT = Path(__file__).resolve().parent.parent


class FakeLaunchctl:
    """Answers each launchctl verb from a script of exit codes."""

    def __init__(self, answers: dict[str, object]) -> None:
        self.answers = answers
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, *args: str) -> subprocess.CompletedProcess[str]:
        verb = args[0]
        self.calls.append(args)
        spec = self.answers.get(verb, 0)
        if isinstance(spec, list):
            code = spec.pop(0) if spec else 0
        else:
            code = int(spec)  # type: ignore[arg-type]
        return subprocess.CompletedProcess(
            args=["launchctl", *args],
            returncode=code,
            stdout="",
            stderr=f"{verb} failed: 5: Input/output error" if code else "",
        )

    def verbs(self) -> list[str]:
        return [c[0] for c in self.calls]


def assert_staged(home: Path) -> None:
    """The timer must not point at the overlay; macOS will refuse Documents."""
    push = home / ".gurdy" / "staged" / "fleet" / "gurdy-push.sh"
    if not push.is_file():
        raise SystemExit("missing staged gurdy-push.sh")
    ship = home / ".gurdy" / "staged" / "fleet" / "ship.py"
    if not ship.is_file():
        raise SystemExit("missing staged ship.py")
    plist = (
        home / "Library" / "LaunchAgents" / f"{install_push.LAUNCHD_LABEL}.plist"
    ).read_text(encoding="utf-8")
    if str(push) not in plist:
        raise SystemExit(f"plist does not name staged push.sh:\n{plist}")
    overlay_push = str(ROOT / "fleet" / "gurdy-push.sh")
    if overlay_push in plist:
        raise SystemExit("plist still points at the overlay checkout")


def run(
    answers: dict[str, object], inspect=None
) -> tuple[FakeLaunchctl, SystemExit | None, str]:
    """Install into a throwaway HOME. Returns the fake, any exit, and stdout."""
    fake = FakeLaunchctl(answers)
    real_launchctl = install_push._launchctl
    real_sleep = install_push.time.sleep
    real_home = os.environ.get("HOME")
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["HOME"] = tmp
        install_push._launchctl = fake
        install_push.time.sleep = lambda _s: None
        try:
            with contextlib.redirect_stdout(out):
                install_push.install_launchd(ROOT, Path(tmp) / ".gurdy")
                if inspect:
                    inspect(Path(tmp))
            raised: SystemExit | None = None
        except SystemExit as exc:
            raised = exc
        finally:
            install_push._launchctl = real_launchctl
            install_push.time.sleep = real_sleep
            if real_home is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = real_home
    return fake, raised, out.getvalue()


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    # First install: nothing to boot out. That failure is expected, so it must
    # not stop the install and must not reach the user.
    fake, raised, out = run(
        {"bootout": 1, "bootstrap": 0, "print": 0}, inspect=assert_staged
    )
    eq(raised, None, "first install raised")
    eq(fake.verbs(), ["bootout", "bootstrap", "print"], "first install verbs")
    if "loaded" not in out:
        raise SystemExit(f"first install: no confirmation, got {out!r}")
    if "staged" not in out:
        raise SystemExit(f"first install: did not print staged timer path, got {out!r}")

    # Reinstall over a loaded agent. The old code ran `load` here, which fails.
    fake, raised, _ = run({"bootout": 0, "bootstrap": 0, "print": 0})
    eq(raised, None, "reinstall raised")
    eq("load" in fake.verbs(), False, "reinstall used legacy load")

    # bootout can still be settling, so bootstrap is retried before falling back.
    fake, raised, _ = run({"bootout": 0, "bootstrap": [1, 0], "print": 0})
    eq(raised, None, "retry raised")
    eq(fake.verbs().count("bootstrap"), 2, "bootstrap attempts")
    eq("load" in fake.verbs(), False, "retry fell back too early")

    # Legacy rescue: bootstrap never takes, the old path does.
    fake, raised, _ = run(
        {"bootout": 0, "bootstrap": [1, 1, 1], "unload": 0, "load": 0, "print": 0}
    )
    eq(raised, None, "legacy rescue raised")
    eq(fake.verbs().count("bootstrap"), 3, "legacy rescue attempts")
    eq("load" in fake.verbs(), True, "legacy rescue skipped load")

    # The regression: `load` exits 0 while the job is not there. Trusting that
    # exit code is what printed "loaded" over a machine that ships nothing.
    fake, raised, out = run(
        {"bootout": 0, "bootstrap": [1, 1, 1], "unload": 0, "load": 0, "print": 1}
    )
    if raised is None:
        raise SystemExit("unverified load: claimed success, print said no")
    if "loaded" in out:
        raise SystemExit(f"unverified load: printed a claim anyway, {out!r}")

    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
