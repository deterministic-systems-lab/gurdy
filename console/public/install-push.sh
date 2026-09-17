#!/bin/sh
# Laptop installer. Mint a device token, then from any directory:
#   curl -fsSL ${GURDY_DASHBOARD_URL}/install-push.sh | sh -s -- 'grd_…'
#
# Finds an existing Gurdy checkout, or clones
# deterministic-systems-lab/gurdy into ~/gurdy. Then:
#   1. writes ~/.gurdy/push.env and loads the 30-second timer
#   2. installs Cursor hooks + wrapped MCP (skip with GURDY_SKIP_CURSOR=1)
#   3. ships ~/.gurdy/ledger once if it exists
set -eu

URL="${GURDY_DASHBOARD_URL:-}"
TOKEN="${1:-${GURDY_DEVICE_TOKEN:-}}"
REPO="${GURDY_CLONE_URL:-https://github.com/deterministic-systems-lab/gurdy.git}"
MANAGED="${HOME}/gurdy"

if [ -z "$TOKEN" ]; then
	echo "usage: curl -fsSL ${URL}/install-push.sh | sh -s -- 'grd_YOURTOKEN'" >&2
	echo "   or: GURDY_DEVICE_TOKEN=grd_YOURTOKEN curl -fsSL ${URL}/install-push.sh | sh" >&2
	exit 2
fi

# Catch a placeholder before anything is written. Pasting the example verbatim
# used to write push.env, load the timer and install the Cursor hooks, and only
# then die in urllib, leaving the machine half configured on a token that can
# never work.
case "$TOKEN" in
grd_*) ;;
*)
	echo "install-push.sh: that does not look like a device token." >&2
	echo "  Expected one starting with grd_, got: $TOKEN" >&2
	echo "  Mint one on ${URL} and pass that." >&2
	exit 2
	;;
esac
if printf '%s' "$TOKEN" | LC_ALL=C grep -q '[^ -~]'; then
	echo "install-push.sh: the token has characters that cannot go in an HTTP header." >&2
	echo "  If you copied 'grd_…' from the instructions, that is the placeholder." >&2
	echo "  Mint a real token on ${URL} and pass that." >&2
	exit 2
fi

is_root() {
	[ -f "$1/fleet/install_push.py" ] &&
		[ -f "$1/adapters/cursor/install.py" ] &&
		[ -f "$1/fleet/ship.py" ]
}

find_existing() {
	if [ -n "${GURDY_ROOT:-}" ] && is_root "$GURDY_ROOT"; then
		echo "$GURDY_ROOT"
		return 0
	fi
	d=$(pwd)
	while [ "$d" != / ]; do
		if is_root "$d"; then
			echo "$d"
			return 0
		fi
		d=$(dirname "$d")
	done
	for cand in \
		"$HOME/Documents/GitHub/gurdy" \
		"$HOME/Documents/GitHub/gurdy-oss" \
		"$HOME/src/gurdy" \
		"$HOME/code/gurdy" \
		"$MANAGED"; do
		if is_root "$cand"; then
			echo "$cand"
			return 0
		fi
	done
	return 1
}

clone_overlay() {
	dest=$1
	if [ -e "$dest" ] && [ ! -d "$dest" ]; then
		echo "install-push.sh: $dest exists and is not a directory" >&2
		exit 1
	fi
	if [ -d "$dest" ] && [ "$(ls -A "$dest" 2>/dev/null)" ]; then
		echo "install-push.sh: $dest exists but is not a Gurdy checkout (missing fleet/install_push.py)" >&2
		echo "set GURDY_ROOT to an existing clone, or remove $dest" >&2
		exit 1
	fi
	if ! command -v git >/dev/null 2>&1; then
		echo "install-push.sh: git is required to clone Gurdy" >&2
		exit 1
	fi
	echo "cloning $REPO into $dest" >&2
	mkdir -p "$(dirname "$dest")"
	if ! GIT_TERMINAL_PROMPT=0 git clone --filter=blob:none "$REPO" "$dest"; then
		echo "install-push.sh: git clone failed (private repo needs gh auth login)." >&2
		echo "  gh auth login" >&2
		echo "  git clone $REPO $dest" >&2
		echo "  then re-run this curl" >&2
		exit 1
	fi
}

if ROOT=$(find_existing); then
	:
else
	dest=${GURDY_ROOT:-$MANAGED}
	clone_overlay "$dest"
	ROOT=$dest
fi
echo "checkout: $ROOT"

if [ -f "$ROOT/bin/gurdy-proxy" ]; then
	chmod +x "$ROOT/bin/gurdy-proxy" "$ROOT/bin/gurdy-verify" 2>/dev/null || true
fi

# This curl runs the code in the overlay, not the code behind this URL, so an
# old checkout means old bugs from a command that looks like it fetched the
# latest. Only ~/gurdy used to be updated, and nobody on the team has their
# checkout there. Fast-forward when that is safe; say so loudly when it is not.
sync_overlay() {
	root=$1
	[ -d "$root/.git" ] || return 0
	command -v git >/dev/null 2>&1 || return 0

	if ! GIT_TERMINAL_PROMPT=0 git -C "$root" fetch --quiet origin 2>/dev/null; then
		echo "install-push.sh: could not reach origin; using $root as it is" >&2
		return 0
	fi

	behind=$(git -C "$root" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
	[ "$behind" = "0" ] && return 0

	branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
	dirty=$(git -C "$root" status --porcelain 2>/dev/null | head -1)

	# Someone's working clone is theirs. Only move it when it is plain main
	# with nothing in progress.
	if [ "$branch" = "main" ] && [ -z "$dirty" ] &&
		GIT_TERMINAL_PROMPT=0 git -C "$root" merge --ff-only origin/main >/dev/null 2>&1; then
		echo "updated $root ($behind behind origin/main)"
		return 0
	fi

	echo "" >&2
	echo "install-push.sh: $root is $behind commit(s) behind origin/main," >&2
	echo "  on branch '${branch:-unknown}'${dirty:+ with uncommitted changes}." >&2
	echo "  This installer runs that clone, so you may hit bugs already fixed." >&2
	echo "  Update it, then re-run this command:" >&2
	echo "    git -C $root pull --ff-only" >&2
	echo "" >&2
}

sync_overlay "$ROOT"

python3 "$ROOT/fleet/install_push.py" --root "$ROOT" --url "$URL" --token "$TOKEN"

if [ "${GURDY_SKIP_CURSOR:-}" = "1" ]; then
	echo "skip Cursor hooks (GURDY_SKIP_CURSOR=1)"
else
	python3 "$ROOT/adapters/cursor/install.py" --root "$ROOT"
	if [ ! -x "$ROOT/bin/gurdy-proxy" ]; then
		echo "install-push.sh: $ROOT/bin/gurdy-proxy is missing; wrap will fail until: make -C $ROOT proxy" >&2
	fi
	echo "restart Cursor so ~/.cursor/hooks.json and mcp.json take effect"
fi

if [ -d "$HOME/.gurdy/ledger" ]; then
	echo "shipping ~/.gurdy/ledger once"
	python3 "$ROOT/fleet/ship.py" \
		--ledger "$HOME/.gurdy/ledger" \
		--verifier "$ROOT/bin/gurdy-verify" \
		--proxy "$ROOT/bin/gurdy-proxy" \
		--url "$URL" \
		--token "$TOKEN"
fi
