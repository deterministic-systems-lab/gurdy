import assert from "node:assert/strict";
import test from "node:test";
import { normalizePolicyName, pickPackForUser } from "./policy-name.ts";

test("normalizePolicyName trims and rejects junk", () => {
  assert.equal(normalizePolicyName("  Strict  "), "Strict");
  assert.equal(normalizePolicyName("intern-pack"), "intern-pack");
  assert.equal(normalizePolicyName(""), null);
  assert.equal(normalizePolicyName("../etc"), null);
  assert.equal(normalizePolicyName("has\nnewline"), null);
});

test("pickPackForUser uses the assignment when the name still exists", () => {
  const packs = [
    { name: "default", bundle_ver: "file:aaa", cedar: "a", is_default: true },
    { name: "strict", bundle_ver: "file:bbb", cedar: "b", is_default: false },
  ];
  const hit = pickPackForUser("strict", packs);
  assert.equal(hit?.assigned, true);
  assert.equal(hit?.pack.bundle_ver, "file:bbb");
});

test("pickPackForUser falls back to default when unassigned or stale", () => {
  const packs = [
    { name: "default", bundle_ver: "file:aaa", cedar: "a", is_default: true },
    { name: "strict", bundle_ver: "file:bbb", cedar: "b", is_default: false },
  ];
  assert.equal(pickPackForUser(null, packs)?.pack.name, "default");
  assert.equal(pickPackForUser("gone", packs)?.assigned, false);
  assert.equal(pickPackForUser("gone", packs)?.pack.name, "default");
});
