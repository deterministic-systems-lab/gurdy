-- Estate desired-state + per-device actuals. Heartbeat is the source of
-- "what is running now". Decision bundle_ver is not that.

CREATE TABLE fleet_desired (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enforce BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fleet_desired (id, enforce) VALUES (1, false);

CREATE TABLE device_reports (
  device_id UUID PRIMARY KEY REFERENCES devices (id) ON DELETE CASCADE,
  hostname TEXT,
  os TEXT,
  shipper TEXT,
  observed_bundle_ver TEXT,
  policy_path TEXT,
  enforce_applied BOOLEAN NOT NULL DEFAULT false,
  ledgers JSONB NOT NULL DEFAULT '[]'::jsonb,
  surfaces JSONB NOT NULL DEFAULT '{}'::jsonb,
  git_head TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX device_reports_last_seen_idx ON device_reports (last_seen_at DESC);
