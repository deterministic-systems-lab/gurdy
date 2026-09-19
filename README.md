# Gurdy

**A flight recorder for AI agents.** Gurdy sits between your agent and the tools
it calls, decides every call against a policy you can read, and writes a
tamper-evident record that someone who does not trust you can verify offline.

Default Act is monitor: every call is recorded and forwarded. Pass
`-enforce` (or create `~/.gurdy/state/enforce`) to stop calls the pack
concludes should block. The three fields stay three fields — see
[Monitor mode](#monitor-mode-the-default-does-not-block-traffic).

> **Status: early, Phase 1.** The core works and is tested; a lot is not built.
> Gurdy is entirely open source — there is no paid tier and no withheld
> component. See [What is not built](#what-is-not-built).

## Five minutes, no infrastructure

You need Go 1.26+ (`proxy/go.mod`). Nothing else — no server, no account, no network.

```bash
git clone https://github.com/deterministic-systems-lab/gurdy && cd gurdy/proxy
go build -o /tmp/gurdy-proxy ./cmd/gurdy-proxy
go build -o /tmp/gurdy-verify ./cmd/gurdy-verify
```

Now govern something. `gurdy-proxy -stdio` wraps any MCP server as a subprocess
and relays its protocol untouched — so `cat` stands in as a server that echoes
whatever you send it:

```bash
cd /tmp && mkdir -p demo && cd demo

echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/home/me/.ssh/id_rsa"}}}' \
  | /tmp/gurdy-proxy -stdio -ledger-dir ./ledger -state-dir ./state -- cat
```

> Keep that JSON on **one line**. MCP stdio framing is newline-delimited, so a
> pretty-printed frame is two incomplete frames: the shim relays them untouched,
> records nothing, and it looks like it worked. (This paragraph exists because
> the first draft of this README got it wrong.)

Two things happen. Your JSON comes back on **stdout**, byte for byte — Gurdy is
in the path and did not touch it. And on **stderr** you get the decision:

```json
{"decision":"flag","policy_ids":["flag-credential-read"],
 "action_applied":"forwarded","principal":"svc:stdio:cat",
 "principal_tier":"attested-coarse","tool":"read_file"}
```

An agent read a private key. That is now written down.

### Check that the record is real

```bash
/tmp/gurdy-verify ./ledger
```

```
OK  ledger/local_stdio_cat-….jsonl: 3 records, 1 decisions, 1 batch signatures
    chain: tenant=local workload=stdio:cat instance=gurdy-local#01KYG… schema=v1
    head: seq 3 hash 83640c4c7c66be52…
```

`gurdy-verify` needs nothing but the binary and the directory — no server, no
key, no network. That is the point: the export **is** the evidence, and anyone
can re-walk its hash chain and check its signatures. Hand someone the folder and
they can check your work without trusting you.

Try breaking it. Change one character inside any record and run `gurdy-verify`
again; it will name the record where the chain stops.

### Read it as a report

```bash
cd gurdy/reporter && uv sync
uv run gurdy-report /tmp/demo/ledger --verifier /tmp/gurdy-verify
```

You get Markdown a person can read, with every claim citing the ledger records
it rests on — and a JSON sibling for tooling (`--json`). It **refuses** to
produce a report from an export that fails verification, because a report over
unverified records looks exactly like a report over sound ones.

## What just happened

Every intercepted call runs five stages (§4.2):

```
identify  →  classify  →  decide   →  act       →  attest
who was    what kind    Cedar       forward      append a
this?      of call?     policy      (always)     signed record
```

- **identify** — a proxy-observed principal, always. If your agent uses a Gurdy
  SDK it also carries an *asserted* identity and a lineage of which sub-agent
  spawned which. The two are recorded separately and the observed one never
  degrades, so an agent cannot choose the identity it is authorised as.
- **classify** — an extractor names the action (`mcp/tools_call`,
  `llm/completion`) and pulls out metadata: which tool, which path, which model.
  Never payload content.
- **decide** — embedded [Cedar](https://www.cedarpolicy.com/). Local,
  deterministic, sub-millisecond. No network call, no model.
- **act** — forwards in monitor mode; with `-enforce`, a `decision=block`
  stops the call after the record is durable.
- **attest** — appends to a hash-chained, batch-signed JSONL ledger.

## Monitor mode: the default does not block traffic

This is a deliberate default, not a missing flag.

A record can say `decision: block` — that means *a policy concluded it would
have blocked*. What actually happened is a separate field, `action_applied`.
In monitor mode that field is `forwarded`. Pass `-enforce` and the same
forbid records `action_applied=blocked` and the call does not run. A third
field, `policy_mode`, says which actuator was selected.

Three fields, because collapsing them is how a monitoring tool starts making
enforcement claims it cannot support.

**A report saying "37 violations" must also say how many were stopped.**
In monitor mode that second number is zero. With `-enforce` it is the
count of `action_applied=blocked`.

## Connect Cursor, Claude Code, Antigravity, or ChatGPT

Build the proxy once, then drop Gurdy onto the host you already use.
A surface is connected only when a tool call reaches `gurdy-proxy` and
lands in the ledger. Details — including what each product cannot see —
are in [`docs/hosts.md`](docs/hosts.md).

```bash
make proxy
python3 adapters/connect.py --root . --host cursor        # ~/.cursor
python3 adapters/connect.py --root . --host claude        # Claude Code
python3 adapters/connect.py --root . --host antigravity   # ~/.gemini/config
python3 adapters/connect.py --root . --host chatgpt       # desktop / Codex, not chatgpt.com
```

Restart the host. Codex also needs `/hooks` to trust the new command.
Then `gurdy-verify ~/.gurdy/ledger/<host>` after the agent uses a tool.

## The two modes

**stdio shim** — wraps a local MCP server, zero infrastructure. What you just
ran. stdout is the protocol channel; decisions go to stderr.

```bash
gurdy-proxy -stdio -ledger-dir ./led -state-dir ./state -- your-mcp-server --flags
```

**Reverse proxy** — sits in front of an HTTP MCP server or a model API.

```bash
gurdy-proxy -upstream http://localhost:3000 -listen :8090 \
            -ledger-dir ./led -state-dir ./state
curl localhost:8091/health     # admin API, localhost-only
curl localhost:8091/latency    # what the proxy itself costs, per stage
```

## Policy

The bundled starter pack (BR-11) is three rules in
[`proxy/internal/policy/starter.cedar`](proxy/internal/policy/starter.cedar):
credential reads, destructive filesystem operations, and model calls to
unlisted hosts. Point `-policy` at your own `.cedar` file or a `.tar.gz` pack to
replace it.

```cedar
@id("flag-credential-read") @enforce_action("flag") @on_error("open")
forbid (principal, action == Action::"mcp/tools_call", resource)
when { context has resource_path && context.resource_path like "*/.ssh/*" };
```

`@enforce_action` is the graduation knob: `"block"` makes the record read *would
have blocked* today, and blocks once the Phase 2 actuator exists.

**We publish what our own pack does not catch.** [`corpus/`](corpus/) holds 27
replayable attack traces, and seven of them are attacks that currently succeed —
each with why, and what would close it. Run them:

```bash
cd proxy && go build -o /tmp/gc ./cmd/gurdy-conform
/tmp/gc -cases ../corpus/traces -proxy /tmp/gurdy-proxy
```

## SDKs

Optional. Without one, Gurdy still records every call against a coarse principal
derived from the environment. With one, you also get the agent's own claim about
who it is and which sub-agent spawned which.

Point them at a running proxy with `GURDY_PROXY_URL` and `GURDY_TIS_SOCKET`
(the proxy prints the socket path at startup), then mark the task boundary once:

```python
import gurdy                                    # sdk/python
with gurdy.task(agent="orchestrator", human_actor="alice@example.com"):
    ...                                          # calls inside carry lineage
```

```ts
import * as gurdy from '@gurdy/sdk';            // sdk/typescript
await gurdy.task({ agent: 'orchestrator' }, async () => { ... });
```

Both are judged by [one shared corpus](conformance/) so they cannot drift.
Neither holds signing keys, neither decides anything, and neither can fabricate
a claim: outside a task context a call goes out unenriched.

## Repository

| | |
|---|---|
| [`proxy/`](proxy/) | the Go core — proxy, identity, policy, ledger, verifier |
| [`sdk/python`](sdk/python/), [`sdk/typescript`](sdk/typescript/) | provenance enrichment |
| [`reporter/`](reporter/) | ledger → readable governance report |
| [`conformance/`](conformance/) | the shared corpus both SDKs must pass |
| [`corpus/`](corpus/) | adversarial traces that gate the policy pack |
| [`docs/`](docs/) | the [normative spec](docs/spec.md), [roadmap](docs/roadmap.md), [performance](docs/performance.md), [activity log](docs/activity-log.md) |
| [`policy/`](policy/) | pack builder: `controls.json` → Cedar, plus a replay gate |
| [`fleet/`](fleet/) | device shipper: verify, ingest, pull desired pack/enforce |
| [`console/`](console/) | suggested Next.js management framework (fleet + policy APIs) |
| [`adapters/`](adapters/) | drop Gurdy onto a host agent — [install Cursor, Claude Code, Antigravity, ChatGPT/Codex](docs/hosts.md) |

`docs/spec.md` is normative — section numbers in
code comments point into it, and the doc wins over the code.

## What is not built

Stated plainly because a governance tool that overstates itself has picked the
wrong thing to be bad at:

- **No packaging.** No `brew`/`npm`/`pipx` install, no signed binaries, no SBOM.
  You build from source. (§3.J)
- **Blocking is opt-in.** Monitor is the default. `-enforce` is the local
  actuator (ADR-14). Admin-API mutating routes are still unauthenticated on
  localhost — do not treat a laptop as sealed.
- **No LangChain or Claude-agent-SDK hooks yet.** The SDKs do not bundle the
  Go core for dev mode. Host adapters for Cursor, Claude Code, Antigravity,
  and ChatGPT desktop / Codex live in [`adapters/`](adapters/); install
  steps are in [`docs/hosts.md`](docs/hosts.md). chatgpt.com cannot be
  connected.
- **Seven known attack gaps**, published in [`corpus/`](corpus/) rather than
  quietly omitted. Five share one root cause: controls match on strings the
  agent chooses.
- **No framework-mapped report** (NIST / ISO / EU AI Act mapping). Fleet
  desired/actual and the policy builder are in this tree; that mapping is
  not.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
