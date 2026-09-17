-- One-off bearer for `python3 policy/pack.py publish`. Session cookies
-- do not work from the CLI. Device tokens stay ingest/heartbeat-only.

CREATE TABLE admin_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX admin_tokens_user_idx ON admin_tokens (user_id);
