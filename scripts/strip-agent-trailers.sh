#!/usr/bin/env bash
# Remove coding-agent authorship trailers from a commit message file.
# Host product names in the subject or body are left alone.
set -euo pipefail

file=${1:?usage: strip-agent-trailers.sh <commit-message-file>}
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

awk '
  BEGIN { IGNORECASE = 1 }
  /^(Co-authored-by:.*(Cursor|Claude|ChatGPT|Copilot|Gemini|Codex)|(Cursor-Session|Claude-Session):)/ { next }
  /Generated with (Cursor|Claude)/ { next }
  { print }
' "$file" >"$tmp"

while [ -s "$tmp" ] && [ -z "$(tail -n 1 "$tmp")" ]; do
  sed -i '' -e '$d' "$tmp"
done

if [ ! -s "$tmp" ]; then
  echo "strip-agent-trailers: message would be empty" >&2
  exit 1
fi
if ! awk '
  BEGIN { IGNORECASE = 1; bad = 0 }
  /^(Co-authored-by:.*(Cursor|Claude|ChatGPT|Copilot|Gemini|Codex)|(Cursor-Session|Claude-Session):)/ { bad = 1 }
  /Generated with (Cursor|Claude)/ { bad = 1 }
  END { exit bad }
' "$tmp"; then
  echo "strip-agent-trailers: agent trailer survived the filter" >&2
  exit 1
fi
cat "$tmp" >"$file"
