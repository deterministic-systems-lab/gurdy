Prebuilt `gurdy-verify-linux-amd64` and `gurdy-proxy-linux-amd64` for the
Vercel ingest and policy-compile functions. Built from `GURDY_COMMIT` in
the overlay Makefile (`make web-bins`).

Do not replace these with a TypeScript verifier. Gurdy §3.3: the Go core
is the single implementation.

Rebuild with `make web-bins` from the repo root. The darwin/arm64 bins in
`../bin/` are unchanged.
