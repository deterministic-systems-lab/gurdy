#!/bin/sh
# Print the Cedar file gurdy-proxy should load. Same order as hooks/policy_path.py:
#   GURDY_POLICY (if it exists) → $GURDY_HOME/policy/current.cedar → git pack
# Usage: gurdy-policy-path.sh <repo-root>
set -eu
ROOT="${1:?usage: gurdy-policy-path.sh <repo-root>}"
if [ -n "${GURDY_POLICY:-}" ] && [ -f "$GURDY_POLICY" ]; then
	printf '%s\n' "$GURDY_POLICY"
	exit 0
fi
HOME_GURDY="${GURDY_HOME:-$HOME/.gurdy}"
if [ -f "$HOME_GURDY/policy/current.cedar" ]; then
	printf '%s\n' "$HOME_GURDY/policy/current.cedar"
	exit 0
fi
printf '%s\n' "$ROOT/policy/pack.cedar"
