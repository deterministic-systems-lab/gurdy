# Agent adapters

Gurdy governs whatever you put on its wire: an MCP `tools/call`, an HTTP
model request, or a synthesized frame from an agent hook. An **adapter**
is the small piece that maps a host agent's native events onto that
shape so the same Cedar pack decides every call.

This directory is how Gurdy sits on top of agentic tooling without
becoming that tooling.

Step-by-step install for each product:
**[docs/hosts.md](../docs/hosts.md)**.

```bash
make proxy
python3 adapters/connect.py --root . --host cursor
python3 adapters/connect.py --root . --host claude
python3 adapters/connect.py --root . --host antigravity
python3 adapters/connect.py --root . --host chatgpt
```

## Contract

An adapter must:

1. **Classify** a native event into `{tool, arguments}` that Cedar already
   understands (`resource_path`, `tool`, `url`). Do not invent a second
   action name for the same forbid.
2. **Decide** by sending one JSON-RPC `tools/call` through
   `gurdy-proxy -stdio` (or the HTTP hop). Do not reimplement Cedar.
3. **Act** in the host runtime when `-enforce` is on and the decision is
   `block` (deny the tool, return a protocol error, refuse the write).
   In monitor mode the call still runs; the ledger records
   `decision=block` with `action_applied=forwarded`.
4. **Share one pack.** Native hooks and wrapped MCP servers load the same
   Cedar file (`policy/pack.cedar`, or `$GURDY_HOME/policy/current.cedar`
   after a fleet pull).
5. **Stay fail-open** on a missing binary or a crashed proxy (NFR-3).

Identity is optional. If the host can mint a Gurdy transaction token,
write it to `$GURDY_HOME/identity/current.txn` and the proxy will enrich
the record. Observed `principal` stays what the proxy saw.

## Shipping adapters

| Path | Host | Config the installer writes |
|---|---|---|
| [`cursor/`](cursor/) | Cursor IDE | `~/.cursor/hooks.json`, `~/.cursor/mcp.json` |
| [`claude/`](claude/) | Claude Code | `~/.claude/settings.json`, `~/.claude.json` |
| [`antigravity/`](antigravity/) | Antigravity IDE / CLI | `~/.gemini/config/hooks.json`, `mcp_config.json` |
| [`codex/`](codex/) | ChatGPT desktop, Codex CLI, Codex IDE | `~/.codex/hooks.json`, `~/.codex/config.toml` |

chatgpt.com has no local hook or MCP file. `--host chatgpt` installs
Codex/desktop, not the browser product.

To add another host, copy a thin entry under this directory and keep
`classify` → synthesized `tools/call` → `gurdy-proxy`. Shared normalize
and deny formatting live in [`common/`](common/).

Environment every adapter should honor:

| Variable | Role |
|---|---|
| `GURDY_HOST` | ledger partition name (`cursor`, `claude`, …) |
| `GURDY_TENANT` | ledger partition tenant (default `local`) |
| `GURDY_POLICY` | Cedar file, if you are not using the pulled pack |
| `GURDY_ENFORCE` | `1` enables the local block actuator |
| `GURDY_PROXY` | path to `gurdy-proxy` |
| `GURDY_HOME` | default `~/.gurdy` |
