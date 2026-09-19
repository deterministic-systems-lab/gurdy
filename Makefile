.PHONY: proxy pack check adapter-tests fleet-tests install-host hooks

proxy:
	mkdir -p bin
	go build -o bin/gurdy-proxy ./proxy/cmd/gurdy-proxy
	go build -o bin/gurdy-verify ./proxy/cmd/gurdy-verify

pack:
	python3 policy/pack.py generate

check:
	python3 policy/pack.py check

HOST ?= cursor

install-host:
	python3 adapters/connect.py --root . --host $(HOST)

# Install the commit-msg hook that strips agent authorship trailers.
# Does not change git config; copies into this clone's .git/hooks.
hooks:
	install -m 0755 scripts/commit-msg.hook .git/hooks/commit-msg

adapter-tests:
	python3 adapters/cursor/test_classify.py
	python3 adapters/cursor/test_policy_path.py
	python3 adapters/test_normalize.py
	python3 adapters/test_verdict.py
	python3 adapters/test_connect.py
	python3 policy/test_pack.py
	bash scripts/test-check-dco.sh

fleet-tests:
	python3 fleet/test_ship.py
	python3 fleet/test_fleet_lag.py
	python3 fleet/test_install_push.py
