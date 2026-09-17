#!/bin/sh
# Long-lived HTTP reverse-proxy hop for streamable-http MCP (Atlassian).
#
#   adapters/cursor/http-proxy.sh atlassian https://mcp.atlassian.com/v2/mcp
#
# Listens on 127.0.0.1:18090 by default. Point Cursor at
# http://127.0.0.1:18090/v2/mcp instead of the Atlassian plugin. The plugin
# channel is ungoverable: gurdy-proxy never sees that traffic.
#
# Do not claim Atlassian is governed until a tools/call appears under
# ~/.gurdy/ledger/atlassian/.
set -eu

SERVER="${1:?usage: gurdy-http-proxy.sh <server-name> <upstream-url>}"
UPSTREAM="${2:?usage: gurdy-http-proxy.sh <server-name> <upstream-url>}"

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
LISTEN="${GURDY_HTTP_LISTEN:-127.0.0.1:18090}"
ADMIN="${GURDY_HTTP_ADMIN:-127.0.0.1:18091}"
TXN_FILE="${GURDY_TXN_FILE:-$HOME/.gurdy/identity/current.txn}"

LEDGER_DIR="$LEDGER_ROOT/$SERVER"
TIS_SOCK="$STATE_DIR/tis-$SERVER.sock"

mkdir -p "$LEDGER_DIR" "$STATE_DIR"

ENFORCE_ARGS=""
if [ -f "$STATE_DIR/enforce" ] || [ "${GURDY_ENFORCE:-}" = "1" ] || [ "${GURDY_ENFORCE:-}" = "true" ]; then
	ENFORCE_ARGS="-enforce"
fi

echo "gurdy-http-proxy: $LISTEN -> $UPSTREAM  ledger=$LEDGER_DIR" >&2
exec "$PROXY" \
	-listen "$LISTEN" \
	-admin "$ADMIN" \
	-upstream "$UPSTREAM" \
	-tenant "$TENANT" \
	-deploy-id "$DEPLOY_ID" \
	-ledger-dir "$LEDGER_DIR" \
	-state-dir "$STATE_DIR" \
	-tis-socket "$TIS_SOCK" \
	-txn-file "$TXN_FILE" \
	-policy "$POLICY" \
	$ENFORCE_ARGS
