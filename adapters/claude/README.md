# Claude Code adapter

Drop Gurdy onto Claude Code. Native Read, Write, Edit, and Bash become
`mcp/tools_call` against the same Cedar pack as wrapped MCP.

```bash
# from the Gurdy repo root
make proxy
python3 adapters/connect.py --root . --host claude
# restart Claude Code, then /mcp
```

Writes `~/.claude/settings.json` (user `PreToolUse`) and merges wrapped
stdio servers into `~/.claude.json`. Project `.mcp.json` is left alone.

MCP tools named `mcp__…` are skipped here when the server is already
wrapped — `gurdy-proxy -stdio` already decided that call.

See [docs/hosts.md](../../docs/hosts.md).
