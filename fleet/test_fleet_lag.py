#!/usr/bin/env python3
"""Lag flags for GET /api/fleet. Keep in lockstep with web/lib/fleet-lag.ts."""

from __future__ import annotations

from datetime import datetime, timezone

STALE_AFTER_S = 900


def device_lag(
    row: dict,
    desired: dict,
    now_ms: int,
    stale_after_s: int = STALE_AFTER_S,
) -> list[str]:
    flags: list[str] = []
    if row.get("revoked_at"):
        flags.append("revoked")
    seen_at = row.get("last_seen_at")
    if not seen_at:
        flags.append("never_seen")
        return flags
    seen = datetime.fromisoformat(seen_at.replace("Z", "+00:00")).timestamp() * 1000
    if now_ms - seen > stale_after_s * 1000:
        flags.append("stale")
    if desired.get("bundle_ver") and row.get("observed_bundle_ver") != desired["bundle_ver"]:
        flags.append("pack_lag")
    if bool(row.get("enforce_applied")) != bool(desired.get("enforce")):
        flags.append("enforce_lag")
    return flags


def eq(got, want, label: str) -> None:
    if got != want:
        raise SystemExit(f"{label}: got {got!r} want {want!r}")


def main() -> int:
    desired = {"bundle_ver": "file:abc", "enforce": False}
    now = int(datetime(2026, 9, 15, 18, 0, tzinfo=timezone.utc).timestamp() * 1000)
    eq(
        device_lag(
            {
                "revoked_at": None,
                "last_seen_at": None,
                "observed_bundle_ver": None,
                "enforce_applied": None,
            },
            desired,
            now,
        ),
        ["never_seen"],
        "never_seen",
    )
    eq(
        device_lag(
            {
                "revoked_at": None,
                "last_seen_at": "2026-09-15T18:00:00Z",
                "observed_bundle_ver": "file:old",
                "enforce_applied": False,
            },
            desired,
            now,
        ),
        ["pack_lag"],
        "pack_lag",
    )
    eq(
        device_lag(
            {
                "revoked_at": None,
                "last_seen_at": "2026-09-15T18:00:00Z",
                "observed_bundle_ver": "file:abc",
                "enforce_applied": False,
            },
            {"bundle_ver": "file:abc", "enforce": True},
            now,
        ),
        ["enforce_lag"],
        "enforce_lag",
    )
    stale = device_lag(
        {
            "revoked_at": None,
            "last_seen_at": "2026-09-15T17:00:00Z",
            "observed_bundle_ver": "file:abc",
            "enforce_applied": False,
        },
        desired,
        now,
    )
    if "stale" not in stale:
        raise SystemExit(f"stale: {stale}")
    eq(
        device_lag(
            {
                "revoked_at": None,
                "last_seen_at": "2026-09-15T18:00:00Z",
                "observed_bundle_ver": "file:abc",
                "enforce_applied": False,
            },
            desired,
            now,
        ),
        [],
        "in sync",
    )
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
