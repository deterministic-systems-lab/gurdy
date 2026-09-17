.PHONY: proxy pack check adapter-tests fleet-tests

proxy:
	mkdir -p bin
	go build -o bin/gurdy-proxy ./proxy/cmd/gurdy-proxy
	go build -o bin/gurdy-verify ./proxy/cmd/gurdy-verify

pack:
	python3 policy/pack.py generate

check:
	python3 policy/pack.py check

adapter-tests:
	python3 adapters/cursor/test_classify.py
	python3 adapters/cursor/test_policy_path.py
	python3 policy/test_pack.py

fleet-tests:
	python3 fleet/test_ship.py
	python3 fleet/test_fleet_lag.py
	python3 fleet/test_install_push.py
