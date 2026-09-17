import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CATALOG,
  addGlobs,
  cedarFromSelection,
  defaultSelection,
  dirParent,
  parseGlob,
  renderCedar,
  selectionFromCedar,
  summarizeCedar,
  toggleGlob,
} from "./pack.ts";

const GIT_CEDAR = new URL("../../policy/pack.cedar", import.meta.url);
const GIT_CONTROLS = new URL("../../policy/controls.json", import.meta.url);

test("catalog matches policy/controls.json", () => {
  const git = JSON.parse(readFileSync(GIT_CONTROLS, "utf8")) as typeof CATALOG;
  assert.deepEqual(CATALOG.ids, git.ids);
  assert.deepEqual(
    CATALOG.credential_paths.map((e) => e.glob),
    git.credential_paths.map((e: { glob: string }) => e.glob),
  );
  assert.deepEqual(CATALOG.destructive_tools, git.destructive_tools);
  assert.deepEqual(
    CATALOG.shell_aliases.map((a) => a.command),
    git.shell_aliases.map((a: { command: string }) => a.command),
  );
  assert.equal(CATALOG.unlisted_model_host, git.unlisted_model_host);
});

test("full catalog Cedar matches policy/pack.cedar", () => {
  const want = readFileSync(GIT_CEDAR, "utf8");
  const got = cedarFromSelection(defaultSelection());
  assert.equal(got, want);
});

test("renderCedar of the catalog is the same bytes", () => {
  const want = readFileSync(GIT_CEDAR, "utf8");
  assert.equal(renderCedar(CATALOG), want);
});

test("summarizeCedar lists credential globs and the permit", () => {
  const summary = summarizeCedar(renderCedar(CATALOG));
  assert.equal(summary.permit, true);
  const cred = summary.rules.find((r) => r.id === "shadow-credential-read");
  assert.ok(cred);
  assert.equal(cred.kind, "forbid");
  assert.ok(cred.paths.includes("*/.ssh/*"));
  assert.ok(cred.tools.length === 0);
  const named = summary.rules.find((r) => r.id === "shadow-named-tools");
  assert.ok(named);
  assert.deepEqual(named.tools, ["http_fetch"]);
  assert.equal(
    summary.rules.find((r) => r.id === "shadow-sensitive-write"),
    undefined,
  );
});

test("unchecking a family omits that forbid", () => {
  const cedar = cedarFromSelection({
    ...defaultSelection(),
    namedTools: false,
    unlistedModelHost: false,
    destructive: false,
    credentialGlobs: ["*/.env"],
  });
  assert.ok(!cedar.includes("shadow-named-tools"));
  assert.ok(!cedar.includes("shadow-unlisted-model-host"));
  assert.ok(!cedar.includes("shadow-destructive-fs"));
  assert.ok(cedar.includes('like "*/.env"'));
  assert.ok(!cedar.includes('like "*/.ssh"'));
});

test("selectionFromCedar round-trips the default pack", () => {
  const cedar = cedarFromSelection(defaultSelection());
  const back = selectionFromCedar(cedar);
  assert.deepEqual(back, defaultSelection());
});

test("empty write_paths do not emit a write forbid", () => {
  assert.ok(!renderCedar(CATALOG).includes("shadow-sensitive-write"));
  const withWrite = cedarFromSelection({
    ...defaultSelection(),
    writeGlobs: ["*/infra/prod/*"],
  });
  assert.ok(withWrite.includes("shadow-sensitive-write"));
  assert.ok(withWrite.includes('like "*/infra/prod/*"'));
  assert.ok(withWrite.includes('context.tool == "write_file"'));
});

test("parseGlob rejects quotes and empty", () => {
  assert.equal(parseGlob("  */.npmrc  "), "*/.npmrc");
  assert.equal(parseGlob('*/.n"pmrc'), null);
  assert.equal(parseGlob(""), null);
});

test("dirParent adds the directory glob for a /* pattern", () => {
  assert.equal(dirParent("*/.ssh/*"), "*/.ssh");
  assert.equal(dirParent("*/.ssh"), null);
});

test("addGlobs keeps order and adds the directory companion", () => {
  assert.deepEqual(addGlobs([], "*/.npmrc", true), ["*/.npmrc"]);
  assert.deepEqual(addGlobs([], "*/.foo/*", true), ["*/.foo/*", "*/.foo"]);
});

test("toggleGlob removes and reinserts in catalog order", () => {
  const order = ["a", "b", "c"];
  const withoutB = toggleGlob(["a", "b", "c"], "b", order);
  assert.deepEqual(withoutB, ["a", "c"]);
  assert.deepEqual(toggleGlob(withoutB, "b", order), ["a", "b", "c"]);
});
