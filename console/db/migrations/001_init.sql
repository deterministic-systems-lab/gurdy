-- Auth.js tables (magic-link tokens + sessions). Column names match the
-- adapter. users.id is SERIAL so createUser can omit it.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- A device is a signing key. Trust-on-first-use writes the row on the
-- first ingest that presents an unknown kid; later pushes pin to it.
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kid TEXT NOT NULL UNIQUE,
  pubkey TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens are issued to a user, then bound to a device on first use.
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices (id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- One row per device + partition file. byte_len is the append-only cursor.
CREATE TABLE chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  partition TEXT NOT NULL,
  byte_len BIGINT NOT NULL DEFAULT 0,
  head_hash TEXT,
  last_seq BIGINT,
  segment INTEGER,
  records INTEGER,
  decisions_count INTEGER,
  answered INTEGER,
  unmatched INTEGER,
  dropped BIGINT,
  write_errors BIGINT,
  identity_failed BIGINT,
  clean_end BOOLEAN,
  liveness_gaps INTEGER,
  unclean_restarts INTEGER,
  tenant TEXT,
  workload TEXT,
  instance_id TEXT,
  producer TEXT,
  schema_version INTEGER,
  continues_from TEXT,
  pruned INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, partition)
);

-- Verbatim JSONL line, including its trailing newline. Re-serializing
-- would break the hash chain and the download-and-verify claim.
CREATE TABLE ledger_lines (
  id BIGSERIAL PRIMARY KEY,
  chain_id UUID NOT NULL REFERENCES chains (id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  raw TEXT NOT NULL,
  UNIQUE (chain_id, seq)
);

CREATE TABLE decisions (
  id BIGSERIAL PRIMARY KEY,
  chain_id UUID NOT NULL REFERENCES chains (id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  ts TIMESTAMPTZ,
  call_id TEXT,
  txn_id TEXT,
  assertion_jti TEXT,
  assertion_status TEXT,
  principal TEXT,
  principal_tier TEXT,
  asserted_human_actor TEXT,
  tool TEXT,
  action TEXT,
  resource_attrs JSONB,
  decision TEXT,
  policy_mode TEXT,
  action_applied TEXT,
  policy_effects JSONB,
  bundle_ver TEXT,
  req_hash TEXT,
  UNIQUE (chain_id, seq)
);

CREATE INDEX decisions_bundle_ver_idx ON decisions (bundle_ver);

-- Failures only: a rejected push stores the verifier error so the
-- dashboard can say so instead of going quiet.
CREATE TABLE ingest_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices (id) ON DELETE SET NULL,
  partition TEXT,
  ok BOOLEAN NOT NULL,
  error TEXT,
  verifier_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ingest_attempts_user_created_idx
  ON ingest_attempts (user_id, created_at DESC);
