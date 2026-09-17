-- Sidecar conversation is asserted (last-writer-wins), never observed
-- principal. Do not title a fleet row with this id.

ALTER TABLE device_reports
  ADD COLUMN asserted_conversation_id TEXT;
