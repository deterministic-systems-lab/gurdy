-- Named packs (policy_sets) + per-user assignment. Enforce stays estate-wide.
-- A user with no row in user_policies follows the default set.

ALTER TABLE policies ADD COLUMN IF NOT EXISTS name TEXT;

CREATE TABLE IF NOT EXISTS policy_sets (
  name TEXT PRIMARY KEY,
  bundle_ver TEXT NOT NULL REFERENCES policies (bundle_ver),
  is_default BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS policy_sets_one_default
  ON policy_sets (is_default) WHERE is_default;

CREATE UNIQUE INDEX IF NOT EXISTS policy_sets_name_ci
  ON policy_sets (lower(name));

CREATE TABLE IF NOT EXISTS user_policies (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL REFERENCES policy_sets (name),
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO policy_sets (name, bundle_ver, is_default)
SELECT 'default', bundle_ver, true
FROM policies
WHERE is_current
ORDER BY created_at DESC
LIMIT 1
ON CONFLICT (name) DO NOTHING;

UPDATE policies p
SET name = s.name
FROM policy_sets s
WHERE s.bundle_ver = p.bundle_ver AND p.name IS NULL;

UPDATE policies SET name = bundle_ver WHERE name IS NULL;
