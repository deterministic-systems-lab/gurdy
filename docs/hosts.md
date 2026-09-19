# Install and connect Gurdy to a host agent

Gurdy does not replace Cursor, Claude Code, Antigravity, or ChatGPT. It
sits in front of the **tools those agents call**. Those names are hosts,
not authors of this repository. A surface is connected only when a call
reaches `gurdy-proxy` and lands in the ledger. A hook that only writes
identity is not a connection.

```
host event  →  classify  →  tools/call  →  gurdy-proxy  →  ledger
                 (adapter)                 (-stdio or HTTP)
```

Default Act is monitor: every decided call is recorded and still runs.
Create `~/.gurdy/state/enforce` (or set `GURDY_ENFORCE=1`) when you want
`decision=block` to become `action_applied=blocked` and the host to deny
the tool.

## One-time: build Gurdy

You need Go 1.26+ and Python 3. Nothing else — no account, no server.

```bash
git clone https://github.com/deterministic-systems-lab/gurdy
cd gurdy
make proxy          # bin/gurdy-proxy and bin/gurdy-verify
python3 policy/pack.py generate
```

`bin/gurdy-proxy` must exist before any host can wrap MCP or run native
hooks. The installer will write config that points at this checkout;
keep the clone where you installed from.

Then pick a host:

```bash
python3 adapters/connect.py --root . --host cursor
python3 adapters/connect.py --root . --host claude
python3 adapters/connect.py --root . --host antigravity
python3 adapters/connect.py --root . --host chatgpt   # desktop / Codex, not chatgpt.com
python3 adapters/connect.py --root . --host all
```

`--host chatgpt` and `--host codex` are the same installer. ChatGPT on
the web cannot see a local proxy; see [ChatGPT](#chatgpt-desktop-codex-and-chatgptcom).

## What each host can connect

“Connected” means the row hits `decideCall`. Identity-only hooks do not
count.

| Host | Native tools (Read / Write / Shell) | Local stdio MCP | Remote / plugin MCP | Model HTTP |
|---|---|---|---|---|
| **Cursor** | Yes — `~/.cursor/hooks.json` | Yes — `wrap.sh` in `~/.cursor/mcp.json` | Only if you point Cursor at `http-proxy.sh` | No Cursor chokepoint |
| **Claude Code** | Yes — `PreToolUse` in `~/.claude/settings.json` | Yes — user `mcpServers` in `~/.claude.json` | HTTP MCP stays ungoverable until you put `http-proxy.sh` on that URL | No |
| **Antigravity** | Yes — `~/.gemini/config/hooks.json` | Yes — `~/.gemini/config/mcp_config.json` | Same HTTP hop as above | `PreInvocation` is not `llm/completion` |
| **ChatGPT desktop / Codex CLI / Codex IDE** | Yes — `~/.codex/hooks.json` | Yes — `~/.codex/config.toml` | Streamable HTTP only via the HTTP hop | No |
| **chatgpt.com** | No local hook or MCP file | No | Hosted plugins only; Gurdy never sees them | No |

The same Cedar pack (`policy/pack.cedar`, or the fleet pull at
`~/.gurdy/policy/current.cedar`) decides every connected surface.

## Cursor

Shipping adapter: [`adapters/cursor/`](../adapters/cursor/).

```bash
make proxy
python3 adapters/connect.py --root . --host cursor
# restart Cursor
```

What that writes:

1. `~/.cursor/hooks.json` — `beforeReadFile`, `beforeShellExecution`,
   `preToolUse` (Write, Delete, Grep, StrReplace, EditNotebook,
   WebFetch, WebSearch, Glob, SemanticSearch). Each event is rewritten
   as `mcp/tools_call` and sent through `gurdy-proxy -stdio`.
2. `~/.cursor/mcp.json` — stdio servers from
   `adapters/cursor/servers.json` launched through
   `adapters/cursor/wrap.sh`. Existing unrelated servers are kept.
3. `~/.gurdy/{ledger,state,identity}`.

Restart Cursor so both files load. Then ask the agent to read a
credential path the pack already flags (for example anything under
`.ssh`). You should get a ledger file under `~/.gurdy/ledger/cursor/`
even in monitor mode.

Add another stdio MCP server:

```bash
python3 policy/pack.py add-mcp filesystem -- npx -y @modelcontextprotocol/server-filesystem "$HOME"
python3 adapters/connect.py --root . --host cursor
```

HTTP or marketplace plugins (Atlassian is the usual case) do **not** go
through `-stdio`. Start a local hop and point Cursor at it:

```bash
adapters/cursor/http-proxy.sh atlassian https://mcp.atlassian.com/v2/mcp
# listen: 127.0.0.1:18090
```

In Cursor, add that server as `http://127.0.0.1:18090/v2/mcp` instead of
the plugin. Do not claim the plugin channel is governed until a
`tools/call` appears under `~/.gurdy/ledger/atlassian/`. If OAuth only
works inside the plugin, leave it identity-hook-only.

Composer / model inference never enters `gurdy-proxy`. Do not synthesize
`llm/completion` from `beforeSubmitPrompt`. WebFetch and WebSearch are
the visible exfil path; they are `mcp/tools_call` with a URL.

## Claude Code

```bash
make proxy
python3 adapters/connect.py --root . --host claude
# restart `claude`, then /mcp and approve the wrapped servers
```

What that writes:

1. `~/.claude/settings.json` — a user-scoped `PreToolUse` hook matching
   `Read|Write|Edit|Bash|Grep|Glob|WebFetch|WebSearch|NotebookEdit`.
   The hook prints Claude’s
   `hookSpecificOutput.permissionDecision=deny` when enforce is on and
   Cedar says `block`.
2. `~/.claude.json` — user-scoped `mcpServers` entries whose `command`
   is `adapters/cursor/wrap.sh`. Project `.mcp.json` is not rewritten so
   a clone does not silently change teammates’ machines.

Claude Code also accepts a project hook in `.claude/settings.json`.
Prefer the user file the installer writes unless you intend to commit
the hook. MCP tools named `mcp__<server>__<tool>` are skipped by the
native hook when that server is already wrapped — a second decision
would double-count.

Check a call:

```bash
./bin/gurdy-verify ~/.gurdy/ledger/claude
./bin/gurdy-verify ~/.gurdy/ledger/filesystem
```

## Antigravity

Works for Antigravity IDE, Antigravity 2.0, and Antigravity CLI. They
share `~/.gemini/config/`.

```bash
make proxy
python3 adapters/connect.py --root . --host antigravity
```

Then reload customizations: **Settings → Customizations → Hooks**, or
the agent panel **… → Customizations → Hooks**. In the CLI, `/hooks`.

What that writes:

1. `~/.gemini/config/hooks.json` — a `gurdy` hook on `PreToolUse` for
   `view_file`, `write_to_file`, `replace_file_content`,
   `run_command`, `search_web`, `read_url_content`, and the other
   filesystem tools. The hook returns Antigravity’s `{decision, reason}`.
2. `~/.gemini/config/mcp_config.json` — wrapped stdio servers. You can
   also paste the same `command` / `args` from the MCP Store’s **View
   raw config**.

Workspace-only install: copy those two files to `.agents/hooks.json` and
`.agents/mcp_config.json` instead of `~/.gemini/config/`. The installer
writes the user-global pair.

`PreInvocation` fires before the model call. That is not
`Action::"llm/completion"` — it has no provider host — so Gurdy does
not treat it as a decided surface.

Ledger: `~/.gurdy/ledger/antigravity/` for native tools.

## ChatGPT desktop, Codex, and chatgpt.com

Three products, two realities.

### ChatGPT desktop, Codex CLI, Codex IDE extension

These three share `~/.codex`. Connecting one connects the others.

```bash
make proxy
python3 adapters/connect.py --root . --host chatgpt
# or: --host codex
```

What that writes:

1. `~/.codex/hooks.json` — `PreToolUse` for `Bash`, `apply_patch`,
   `Read`, `Write`, `Edit`, `WebSearch`, `WebFetch`. Codex requires you
   to **trust** a new hook: in the CLI open `/hooks` and accept the
   Gurdy command. Untrusted hooks are skipped.
2. `~/.codex/config.toml` — `[features] hooks = true` if missing, and a
   `[mcp_servers.<name>]` table whose `command` is `wrap.sh`.

Equivalent without the installer, from ChatGPT desktop:

1. Settings → MCP servers → Add server → STDIO.
2. Command: `/absolute/path/to/gurdy/adapters/cursor/wrap.sh`
3. Args: `filesystem` `--` `npx` `-y` `@modelcontextprotocol/server-filesystem` `/Users/you`
4. Restart the app. `/mcp` lists the server.

Or from a shell:

```bash
codex mcp add filesystem -- \
  /absolute/path/to/gurdy/adapters/cursor/wrap.sh \
  filesystem -- \
  npx -y @modelcontextprotocol/server-filesystem "$HOME"
```

Ledger: `~/.gurdy/ledger/codex/` for native tools, and
`~/.gurdy/ledger/<server>/` for each wrap.

### chatgpt.com (ChatGPT in the browser)

There is no local hook file and no local MCP config. Hosted Work plugins
and remote MCP tools run on OpenAI’s side. Gurdy cannot sit in front of
them from this repository. If you need a decided record, use ChatGPT
desktop or Codex on the same machine as `gurdy-proxy`.

## Any other host

If the tool can launch a local stdio MCP server, wrap that command:

```bash
adapters/cursor/wrap.sh <server-name> -- <mcp-command> [args...]
```

Point the host’s MCP settings at `wrap.sh` instead of the server binary.
One ledger directory per server name. That is enough for MCP.

Native Read/Write/Shell need a host hook that:

1. Classifies the event into `{tool, arguments}` Cedar already knows
   (`resource_path`, `tool`, `url`).
2. Sends one JSON-RPC `tools/call` through `gurdy-proxy -stdio`.
3. Denies in the host runtime when `-enforce` is on and the decision is
   `block`.
4. Fails open if the binary is missing (NFR-3).

Copy [`adapters/cursor/`](../adapters/cursor/) or the thinner
[`adapters/claude/`](../adapters/claude/) entry point. The shared loop
is [`adapters/common/`](../adapters/common/). Do not reimplement Cedar.

## Turn on blocking

```bash
touch ~/.gurdy/state/enforce
# or: GURDY_ENFORCE=1
# or: fleet desired enforce on the console
```

No host restart. The next hook or wrap reads the file. In monitor mode a
report that says “37 violations” must also say how many were stopped —
that second number is zero until this file exists.

## Did it connect?

```bash
# native Cursor / Claude / Antigravity / Codex
./bin/gurdy-verify ~/.gurdy/ledger/cursor
./bin/gurdy-verify ~/.gurdy/ledger/claude
./bin/gurdy-verify ~/.gurdy/ledger/antigravity
./bin/gurdy-verify ~/.gurdy/ledger/codex

# wrapped MCP (name from servers.json)
./bin/gurdy-verify ~/.gurdy/ledger/filesystem
```

You are connected when `gurdy-verify` prints `OK` and a `tools/call`
record after the agent actually uses that surface. An empty directory
means the host is not sending traffic through Gurdy yet — usually a
missed restart, an untrusted Codex hook, or a plugin channel that never
hits `wrap.sh`.
