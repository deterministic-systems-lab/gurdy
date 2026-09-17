# Fleet

`ship.py` walks ledger dirs, truncates each partition to the last
`batchsig`, runs `gurdy-verify` on that prefix, and POSTs the suffix to
the management console. It refuses to load if verification fails.

The estate view is **desired vs actual**, not a user's chain list:

| Method | Path | Who |
|---|---|---|
| `GET` | `/api/fleet` | admin session — devices × lag |
| `GET` | `/api/fleet/desired` | device token or session — pack + `enforce` |
| `PUT` | `/api/fleet/desired` | admin — `{ "enforce": true }` |
| `POST` | `/api/fleet/heartbeat` | device token — actual |
| `POST` | `/api/fleet/devices/:id/revoke` | admin |

`lag` values: `never_seen`, `stale` (15 min), `pack_lag`, `enforce_lag`,
`revoked`. Heartbeat is actual. Decision `bundle_ver` is not.

Each ship run (even with no local jsonl) GETs desired, writes
`~/.gurdy/policy/current.cedar` and `~/.gurdy/state/enforce`, then POSTs
the heartbeat. A 409 `device_not_pinned` is skipped until the first
ingest pins the signing key.

```bash
export GURDY_DASHBOARD_URL=https://your-console-host
export GURDY_DEVICE_TOKEN=grd_…
python3 fleet/ship.py --ledger ~/.gurdy/ledger --verifier ./bin/gurdy-verify
```

Install the periodic shipper (launchd on macOS, systemd --user on Linux):

```bash
python3 fleet/install_push.py --root .
```

`report.py` wraps `gurdy-report` for the same dirs. It does not merge
chains.
