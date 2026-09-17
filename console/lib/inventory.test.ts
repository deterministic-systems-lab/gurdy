import assert from "node:assert/strict";
import test from "node:test";
import {
  accessFactsText,
  accessSurface,
  asCountRow,
  displayRules,
  resourceHint,
  ruleIds,
} from "./inventory.ts";

test("resourceHint prefers path, then host, and strips a URL query", () => {
  assert.deepEqual(
    resourceHint({ resource_path: "/Users/u/.ssh/id_rsa", tool_declared: "false" }),
    { kind: "path", value: "/Users/u/.ssh/id_rsa" },
  );
  assert.deepEqual(resourceHint({ resource_host: "exfil.example" }), {
    kind: "host",
    value: "exfil.example",
  });
  assert.deepEqual(
    resourceHint({ url: "https://exfil.example/drop?token=secret" }),
    { kind: "host", value: "exfil.example/drop" },
  );
  assert.equal(resourceHint({ tool_declared: "false" }), null);
  assert.deepEqual(
    resourceHint('{"resource_path":"/tmp/id_rsa","tool_declared":"false"}'),
    { kind: "path", value: "/tmp/id_rsa" },
  );
});

test("displayRules on a block row hides the permit underneath", () => {
  const effects = [
    { policy_id: "allow-all-monitor", decision: "allow", mode: "monitor" },
    { policy_id: "shadow-credential-read", decision: "block", mode: "monitor" },
  ];
  assert.deepEqual(displayRules(effects, "block"), ["shadow-credential-read"]);
  assert.deepEqual(ruleIds(effects), ["allow-all-monitor", "shadow-credential-read"]);
  assert.deepEqual(displayRules(effects, "allow"), [
    "allow-all-monitor",
    "shadow-credential-read",
  ]);
});

test("accessSurface is the ledger dir, not the principal", () => {
  assert.equal(accessSurface("cursor/_proxy-abc.jsonl"), "native");
  assert.equal(accessSurface("_proxy-abc.jsonl"), "native");
  assert.equal(accessSurface("filesystem/_proxy-abc.jsonl"), "wrap");
  assert.equal(accessSurface("arbital_stdio_cat-8e212e2499c095e6.jsonl"), "wrap");
});

test("accessFactsText joins surface, determining rule, and path", () => {
  assert.equal(
    accessFactsText({
      partition: "cursor/_proxy-abc.jsonl",
      policy_effects: [
        { policy_id: "allow-all-monitor", decision: "allow", mode: "monitor" },
        { policy_id: "shadow-credential-read", decision: "block", mode: "monitor" },
      ],
      decision: "block",
      resource_attrs: { resource_path: "/Users/u/.ssh/id_rsa" },
    }),
    "native · shadow-credential-read · path /Users/u/.ssh/id_rsa",
  );
});

test("asCountRow coerces neon counts", () => {
  assert.deepEqual(asCountRow({ key: "read_file", calls: "12", violations: 3, stopped: 0 }), {
    key: "read_file",
    calls: 12,
    violations: 3,
    stopped: 0,
  });
  assert.equal(asCountRow({}).key, "(none)");
});
