import assert from "node:assert/strict";
import test from "node:test";
import { deviceLag, STALE_AFTER_S } from "./fleet-lag.ts";

const desired = { bundle_ver: "file:abc", enforce: false };

test("never_seen is only never_seen", () => {
  const lag = deviceLag(
    {
      revoked_at: null,
      last_seen_at: null,
      observed_bundle_ver: null,
      enforce_applied: null,
    },
    desired,
    Date.now(),
  );
  assert.deepEqual(lag, ["never_seen"]);
});

test("pack_lag when observed differs", () => {
  const lag = deviceLag(
    {
      revoked_at: null,
      last_seen_at: new Date().toISOString(),
      observed_bundle_ver: "file:old",
      enforce_applied: false,
    },
    desired,
    Date.now(),
  );
  assert.deepEqual(lag, ["pack_lag"]);
});

test("enforce_lag when file is off and desired is on", () => {
  const lag = deviceLag(
    {
      revoked_at: null,
      last_seen_at: new Date().toISOString(),
      observed_bundle_ver: "file:abc",
      enforce_applied: false,
    },
    { bundle_ver: "file:abc", enforce: true },
    Date.now(),
  );
  assert.deepEqual(lag, ["enforce_lag"]);
});

test("stale after 15 minutes without a heartbeat", () => {
  const now = Date.parse("2026-09-15T18:00:00Z");
  const lag = deviceLag(
    {
      revoked_at: null,
      last_seen_at: "2026-09-15T17:00:00Z",
      observed_bundle_ver: "file:abc",
      enforce_applied: false,
    },
    desired,
    now,
  );
  assert.ok(lag.includes("stale"));
  assert.equal(STALE_AFTER_S, 900);
});

test("revoked is labelled even with a fresh heartbeat", () => {
  const lag = deviceLag(
    {
      revoked_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      observed_bundle_ver: "file:abc",
      enforce_applied: false,
    },
    desired,
    Date.now(),
  );
  assert.ok(lag.includes("revoked"));
});

// The driver hands back TIMESTAMPTZ as a Date, so that is the shape listFleet
// actually passes. Strings only turn up over JSON.
test("a Date reads the same as its ISO string", () => {
  const now = Date.parse("2026-09-15T18:00:00Z");
  const seen = "2026-09-15T17:00:00Z";
  const row = { observed_bundle_ver: "file:abc", enforce_applied: false };
  assert.deepEqual(
    deviceLag({ ...row, revoked_at: null, last_seen_at: new Date(seen) }, desired, now),
    deviceLag({ ...row, revoked_at: null, last_seen_at: seen }, desired, now),
  );

  const fresh = new Date("2026-09-15T17:59:00Z");
  assert.deepEqual(
    deviceLag({ ...row, revoked_at: null, last_seen_at: fresh }, desired, now),
    [],
    "a fresh Date must not read as stale",
  );
});

test("in sync is empty lag", () => {
  const lag = deviceLag(
    {
      revoked_at: null,
      last_seen_at: new Date().toISOString(),
      observed_bundle_ver: "file:abc",
      enforce_applied: false,
    },
    desired,
    Date.now(),
  );
  assert.deepEqual(lag, []);
});
