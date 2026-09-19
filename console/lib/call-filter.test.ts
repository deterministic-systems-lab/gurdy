import assert from "node:assert/strict";
import test from "node:test";
import { asShown, SHOWN_LABEL } from "./call-filter.ts";

test("a known filter is taken as given", () => {
  assert.equal(asShown("allow"), "allow");
  assert.equal(asShown("block"), "block");
  assert.equal(asShown("all"), "all");
});

test("anything unknown falls back to showing everything", () => {
  // Hiding rows because a query string was wrong is the one failure mode a
  // reader of this page cannot detect, so the fallback is never a subset.
  for (const bad of ["", "ALLOW", "blocked", "drop", "../x", undefined]) {
    assert.equal(asShown(bad), "all", String(bad));
  }
});

test("a repeated param takes the first value", () => {
  assert.equal(asShown(["block", "allow"]), "block");
  assert.equal(asShown(["nonsense", "block"]), "all");
});

test("every filter has a label", () => {
  assert.deepEqual(Object.keys(SHOWN_LABEL).sort(), ["all", "allow", "block"]);
});
