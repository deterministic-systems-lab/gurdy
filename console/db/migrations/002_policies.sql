CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_ver TEXT NOT NULL UNIQUE,
  cedar_text TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  note TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX policies_current_idx ON policies (is_current) WHERE is_current;
