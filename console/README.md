# Management console (suggested framework)

This is a Next.js App Router app that implements the fleet, policy, and
ledger APIs Gurdy devices talk to. Use it as-is, or treat it as the
reference for a console in another stack. The load-bearing pieces are
the routes under `app/api/` and the SQL in `db/migrations/`; the pages
are one way to operate them.

**Suggested stack:** Next.js, Postgres (Neon works), Auth.js magic-link
email, `gurdy-verify` on the ingest path.

## What it provides

- Device tokens (`grd_…`) and admin publish tokens (`gra_…`)
- Ingest that reconstructs a prefix, runs `gurdy-verify`, then appends
- Fleet desired/actual: pack assignment, estate-wide enforce, heartbeat lag
- Policy catalog and a checkbox builder that emits the same Cedar as
  `policy/pack.py`
- Per-device chain list, violations, and offline export

## Local

```bash
cp .env.example .env.local
# set DATABASE_URL, AUTH_SECRET, AUTH_URL, RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAILS
npm install
npm run migrate
npm run dev
```

Build `gurdy-verify` for the ingest host (linux/amd64 on Vercel):

```bash
mkdir -p console/bin
GOOS=linux GOARCH=amd64 go build -o console/bin/gurdy-verify-linux-amd64 \
  ./proxy/cmd/gurdy-verify
```

Apply every migration under `db/migrations/` before `/api/fleet` or
`python3 policy/pack.py publish`. Admin estate view: `/fleet`.

Tenancy is the device signing key, pinned on first ingest. Admin is the
`ADMIN_EMAILS` list. Do not commit secrets.
