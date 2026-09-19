import assert from "node:assert/strict";
import test from "node:test";
import { claim, identityNote, outcome, outcomeKind, outcomeMark, seenAs } from "./outcome.ts";

test("stopped and shadow marks are different chips", () => {
  const stopped = outcomeMark({
    decision: "block",
    action_applied: "blocked",
    policy_mode: "enforce",
  });
  const shadow = outcomeMark({
    decision: "block",
    action_applied: "forwarded",
    policy_mode: "monitor",
  });
  assert.equal(stopped.kind, "stopped");
  assert.equal(stopped.label, "Stopped");
  assert.equal(stopped.tone, "indigo");
  assert.equal(shadow.kind, "shadow");
  assert.equal(shadow.label, "Shadow");
  assert.equal(shadow.tone, "lavender");
  assert.notEqual(stopped.label, shadow.label);
  assert.equal(
    outcomeKind({
      decision: "block",
      action_applied: "forwarded",
      policy_mode: "enforce",
    }),
    "leaked",
  );
});

test("shadow block and real block do not read the same", () => {
  const wouldHave = outcome({
    decision: "block",
    action_applied: "forwarded",
    policy_mode: "monitor",
  });
  const did = outcome({
    decision: "block",
    action_applied: "blocked",
    policy_mode: "enforce",
  });
  assert.notEqual(wouldHave, did);
  assert.match(wouldHave, /would have/i);
  assert.doesNotMatch(wouldHave, /^Stopped/);
  assert.match(did, /stopped/i);
});

test("what the actuator did outranks what the policy concluded", () => {
  // A block that was not applied must never read as a block.
  assert.doesNotMatch(
    outcome({ decision: "block", action_applied: "forwarded", policy_mode: "enforce" }),
    /^Stopped/,
  );
  // An allow that was stopped reports the stop.
  assert.match(
    outcome({ decision: "allow", action_applied: "blocked", policy_mode: "enforce" }),
    /stopped/i,
  );
});

test("fail-open and fail-closed are told apart", () => {
  const open = outcome({
    decision: null,
    action_applied: "failed-open",
    policy_mode: "enforce",
  });
  const closed = outcome({
    decision: null,
    action_applied: "failed-closed",
    policy_mode: "enforce",
  });
  assert.match(open, /let through/i);
  assert.match(closed, /stopped/i);
  assert.notEqual(open, closed);
});

test("a missing field says so rather than guessing", () => {
  assert.match(
    outcome({ decision: null, action_applied: null, policy_mode: null }),
    /no record/i,
  );
  assert.match(
    outcome({ decision: null, action_applied: "forwarded", policy_mode: "monitor" }),
    /no verdict/i,
  );
});

test("the ordinary identity adds nothing, the notable ones do", () => {
  const base = { principal: "svc:stdio:cat", asserted_human_actor: null };
  assert.deepEqual(
    identityNote({ ...base, principal_tier: "attested", assertion_status: "absent" }),
    [],
    "attested and silent is the common case and should stay quiet",
  );
  assert.equal(
    identityNote({ ...base, principal_tier: "orphan", assertion_status: "absent" }).length,
    1,
  );
  assert.equal(
    identityNote({ ...base, principal_tier: "attested", assertion_status: "invalid" }).length,
    1,
    "a rejected claim must never be silently dropped",
  );
});

test("an unattested identity never reads as attested", () => {
  assert.match(seenAs("orphan"), /not attested/);
  assert.match(seenAs(null), /unknown/);
  assert.match(seenAs("attested-coarse"), /coarse/);
});

test("only a valid assertion carries the claimed name", () => {
  const person = { principal: null, principal_tier: null, asserted_human_actor: "leo" };
  assert.match(claim({ ...person, assertion_status: "valid" }), /leo/);
  // An invalid or absent claim must not surface the name it carried.
  assert.doesNotMatch(claim({ ...person, assertion_status: "invalid" }), /leo/);
  assert.doesNotMatch(claim({ ...person, assertion_status: "absent" }), /leo/);
});
