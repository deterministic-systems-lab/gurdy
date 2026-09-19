#!/usr/bin/env bash
# The DCO check must fail a Cursor (or Claude) co-author trailer and pass a
# host-product mention in the body.
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
msg=$(mktemp)
trap 'rm -rf "$tmp" "$msg"' EXIT

git init -q "$tmp"
git -C "$tmp" config user.name Tristan
git -C "$tmp" config user.email '79180812+tr9800a@users.noreply.github.com'
echo a >"$tmp/f"
git -C "$tmp" add f
git -C "$tmp" commit -q -s -m "base"

echo b >"$tmp/f"
git -C "$tmp" add f
git -C "$tmp" commit -q -s -m "Add the Cursor IDE adapter

Host name in the body is not a trailer.
"
base=$(git -C "$tmp" rev-parse HEAD^)
if ! (cd "$tmp" && "$root/scripts/check-dco.sh" "$base" HEAD >/tmp/dco-ok.out); then
  echo "host-name body should pass" >&2
  cat /tmp/dco-ok.out >&2
  exit 1
fi

echo c >"$tmp/f"
git -C "$tmp" add f
git -C "$tmp" commit -q -s -m "Something

Co-authored-by: Cursor <cursoragent@cursor.sh>
"
base2=$(git -C "$tmp" rev-parse HEAD^)
if (cd "$tmp" && "$root/scripts/check-dco.sh" "$base2" HEAD >/tmp/dco-fail.out); then
  echo "Cursor trailer should fail" >&2
  cat /tmp/dco-fail.out >&2
  exit 1
fi
grep -q 'coding agent' /tmp/dco-fail.out

printf '%s\n' 'Add the Cursor IDE adapter' '' 'Co-authored-by: Cursor <cursoragent@cursor.sh>' 'Signed-off-by: Tristan <79180812+tr9800a@users.noreply.github.com>' >"$msg"
"$root/scripts/strip-agent-trailers.sh" "$msg"
grep -q 'Add the Cursor IDE adapter' "$msg"
grep -q 'Signed-off-by:' "$msg"
if grep -qi 'Co-authored-by:' "$msg"; then
  echo "strip left a Co-authored-by line" >&2
  cat "$msg" >&2
  exit 1
fi

echo ok
