# Cursor adapter

Drop Gurdy onto a Cursor checkout. Native Read, Write, and Shell tools
never reach `gurdy-proxy` on the wire; the hooks in `hooks/` rewrite
each call as `mcp/tools_call` and the proxy decides. Stdio MCP servers
use the same pack through `wrap.sh`.

```bash
# from the Gurdy repo root
go build -o bin/gurdy-proxy ./proxy/cmd/gurdy-proxy
python3 adapters/cursor/install.py --root .
# restart Cursor
```

`install.py` merges generated MCP servers into `~/.cursor/mcp.json` and
replaces `~/.cursor/hooks.json`. It does not delete unrelated MCP
servers you already configured.

## Layout

| Path | Role |
|---|---|
| `servers.json` | source list of MCP servers to wrap |
| `generate_mcp.py` / `generate_hooks.py` | emit Cursor config |
| `install.py` | merge those files into `~/.cursor` |
| `wrap.sh` | stdio MCP → `gurdy-proxy -stdio` |
| `http-proxy.sh` | HTTP MCP hop |
| `hooks/` | Cursor events → classify → govern |

Add a stdio server:

```bash
python3 policy/pack.py add-mcp filesystem -- npx -y @modelcontextprotocol/server-filesystem "$HOME"
python3 adapters/cursor/install.py --root .
```

HTTP or plugin channels that Cursor does not send through a local
command are not governed until you point Cursor at `http-proxy.sh` and a
`tools/call` appears under `~/.gurdy/ledger/<server>/`.

Create `~/.gurdy/state/enforce` (or set `GURDY_ENFORCE=1`, or flip
enforce on the console fleet page) to deny blocked native calls. The
ledger then records `action_applied=blocked`.
