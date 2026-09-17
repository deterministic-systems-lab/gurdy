#!/bin/sh
# Periodic shipper. launchd calls this; it is not on the MCP traffic path.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV="${GURDY_PUSH_ENV:-$HOME/.gurdy/push.env}"
if [ -f "$ENV" ]; then
	set -a
	# shellcheck disable=SC1090
	. "$ENV"
	set +a
fi

if [ -z "${GURDY_DASHBOARD_URL:-}" ] || [ -z "${GURDY_DEVICE_TOKEN:-}" ]; then
	echo "gurdy-push.sh: GURDY_DASHBOARD_URL and GURDY_DEVICE_TOKEN must be set (usually via $ENV)" >&2
	exit 2
fi

exec python3 "$ROOT/fleet/ship.py" \
	--verifier "$ROOT/bin/gurdy-verify" \
	--proxy "$ROOT/bin/gurdy-proxy"
