# Policy builder

The source of truth is `controls.json`. `pack.py` writes `pack.cedar`.
Do not edit the Cedar by hand.

```bash
python3 policy/pack.py pick          # menu
python3 policy/pack.py list
python3 policy/pack.py add-credential --glob '*/.npmrc' --note 'npm token'
python3 policy/pack.py add-write --glob '*/infra/prod/*'
python3 policy/pack.py add-shell --command scp --tool file_exfil
python3 policy/pack.py generate      # rewrite pack.cedar
python3 policy/pack.py check         # fail if cedar is stale
python3 policy/pack.py publish       # POST to the console (GURDY_ADMIN_TOKEN)
```

Credential globs match any `mcp/tools_call` whose `resource_path`
matches. Write globs match only `write_file`. Named shell commands are
aliased to a Cedar `context.tool` so the adapter's classifier and the
pack stay on one list.

`@enforce_action("block")` is the graduation knob. In monitor mode the
record reads `decision=block` and the call still runs. With
`gurdy-proxy -enforce` (or `~/.gurdy/state/enforce`) the actuator
stops the call and records `action_applied=blocked`.

Replay the pack-specific traces:

```bash
go build -o bin/gurdy-proxy ./proxy/cmd/gurdy-proxy
python3 policy/replay_corpus.py \
  --proxy ./bin/gurdy-proxy \
  --policy policy/pack.cedar \
  --cases policy/corpus
```

Publish needs a `gra_…` token minted on the console `/policy` page:

```bash
export GURDY_DASHBOARD_URL=https://your-console-host
export GURDY_ADMIN_TOKEN=gra_…
python3 policy/pack.py publish --name starter
```
