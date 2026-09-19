# Antigravity adapter

Drop Gurdy onto Antigravity IDE, Antigravity 2.0, or Antigravity CLI.
They share `~/.gemini/config/`.

```bash
make proxy
python3 adapters/connect.py --root . --host antigravity
```

Reload **Settings → Customizations → Hooks** (IDE) or `/hooks` (CLI).

Writes `~/.gemini/config/hooks.json` and merges wrapped stdio servers
into `~/.gemini/config/mcp_config.json`. Workspace copies live at
`.agents/hooks.json` and `.agents/mcp_config.json` if you prefer not to
install globally.

`PreInvocation` is not a decided surface. Model HTTP never enters
`gurdy-proxy` from that event.

See [docs/hosts.md](../../docs/hosts.md).
