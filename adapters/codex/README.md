# Codex / ChatGPT desktop adapter

ChatGPT desktop, Codex CLI, and the Codex IDE extension share
`~/.codex`. One install covers all three.

```bash
make proxy
python3 adapters/connect.py --root . --host chatgpt
# in Codex: /hooks and trust the Gurdy command
```

`--host codex` is the same command. ChatGPT in the browser
(chatgpt.com) has no local hook or MCP file and cannot be connected;
use the desktop app.

Writes `~/.codex/hooks.json` and merges `[mcp_servers.*]` plus
`[features] hooks = true` into `~/.codex/config.toml`.

See [docs/hosts.md](../../docs/hosts.md).
