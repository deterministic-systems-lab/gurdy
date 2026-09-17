# Agent adapters

Gurdy governs whatever you put on its wire: an MCP `tools/call`, an HTTP
model request, or a synthesized frame from an agent hook. An **adapter**
is the small piece that maps a host agent's native events onto that
shape so the same Cedar pack decides every call.

This directory is how Gurdy sits on top of agentic tooling without
becoming that tooling.

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

## Shipping adapter

| Path | Host |
|---|---|
| [`cursor/`](cursor/) | Cursor IDE: native Read/Write/Shell hooks plus stdio MCP wrap |

To add another host, copy `cursor/` and replace only the event names,
payload field names, and the deny response the runtime understands.
Keep `classify` → synthesized `tools/call` → `gurdy-proxy`.

Environment every adapter should honor:

| Variable | Role |
|---|---|
| `GURDY_TENANT` | ledger partition tenant (default `local`) |
| `GURDY_POLICY` | Cedar file, if you are not using the pulled pack |
| `GURDY_ENFORCE` | `1` enables the local block actuator |
| `GURDY_PROXY` | path to `gurdy-proxy` |
| `GURDY_HOME` | default `~/.gurdy` |
