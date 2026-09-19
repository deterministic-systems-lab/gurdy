import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bundleVerWeb } from "./bundle-ver.ts";

/** The formula in lib/policy.ts, which is what actually gets stored. */
function bundleVerServer(text: string): string {
  return `file:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 12)}`;
}

test("the preview matches what the server stores", async () => {
  const cases = [
    "permit(principal, action, resource);\n",
    "// no trailing newline\nforbid(principal, action, resource);",
    "unicode ✓ é 日本\n",
    " ",
  ];
  for (const text of cases) {
    assert.equal(await bundleVerWeb(text), bundleVerServer(text), text.slice(0, 24));
  }
});

test("the real pack previews as the hash in docs/policy-impact.md", async () => {
  const pack = readFileSync(
    new URL("../../policy/candidates/add-kube-resource.cedar", import.meta.url),
    "utf8",
  );
  assert.equal(await bundleVerWeb(pack), "file:bf811952796e");
});

test("a trailing newline is a different pack", async () => {
  // Pasting often drops it, and that silently changes the identifier.
  const withNewline = await bundleVerWeb("permit(principal, action, resource);\n");
  const without = await bundleVerWeb("permit(principal, action, resource);");
  assert.notEqual(withNewline, without);
});
