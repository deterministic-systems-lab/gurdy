#!/bin/sh
# Wrap an MCP stdio server with gurdy-proxy. Cursor mcp.json launches this
# instead of the server binary:
#
#   command: .../adapters/cursor/wrap.sh
#   args:    ["<server-name>", "--", <mcp-cmd>, <args>...]
#
# One ledger dir per server so two shims do not share a _proxy chain (two
# writers on one hash chain would fail verification). One state dir so every
# wrap signs with the same key. Per-server TIS socket so they do not fight
# over ~/.gurdy/state/tis.sock.
set -eu

SERVER="${1:?usage: gurdy-wrap.sh <server-name> -- <mcp-cmd> [args...]}"
shift
if [ "${1:-}" = "--" ]; then
	shift
fi
if [ "$#" -lt 1 ]; then
	echo "gurdy-wrap.sh: missing MCP server command" >&2
	exit 2
fi

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
if [ -n "${GURDY_PROXY:-}" ]; then
	PROXY="$GURDY_PROXY"
elif [ -x "$ROOT/bin/gurdy-proxy" ]; then
	PROXY="$ROOT/bin/gurdy-proxy"
else
	PROXY="$ROOT/proxy/gurdy-proxy"
fi
POLICY="$("$ROOT/adapters/cursor/policy-path.sh" "$ROOT")"
LEDGER_ROOT="${GURDY_LEDGER_DIR:-$HOME/.gurdy/ledger}"
STATE_DIR="${GURDY_STATE_DIR:-$HOME/.gurdy/state}"
TENANT="${GURDY_TENANT:-local}"
DEPLOY_ID="${GURDY_DEPLOY_ID:-$(hostname -s)}"

LEDGER_DIR="$LEDGER_ROOT/$SERVER"
TIS_SOCK="$STATE_DIR/tis-$SERVER.sock"
TXN_FILE="${GURDY_TXN_FILE:-$HOME/.gurdy/identity/current.txn}"

mkdir -p "$LEDGER_DIR" "$STATE_DIR"

ENFORCE_ARGS=""
if [ -f "$STATE_DIR/enforce" ] || [ "${GURDY_ENFORCE:-}" = "1" ] || [ "${GURDY_ENFORCE:-}" = "true" ]; then
	ENFORCE_ARGS="-enforce"
fi

exec "$PROXY" \
	-stdio \
	-tenant "$TENANT" \
	-deploy-id "$DEPLOY_ID" \
	-ledger-dir "$LEDGER_DIR" \
	-state-dir "$STATE_DIR" \
	-tis-socket "$TIS_SOCK" \
	-txn-file "$TXN_FILE" \
	-policy "$POLICY" \
	$ENFORCE_ARGS \
	-- "$@"
