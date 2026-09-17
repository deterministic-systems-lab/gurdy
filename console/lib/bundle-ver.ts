/** Browser twin of `bundleVer` in lib/policy.ts.
 *
 * The upload card shows the identifier before publishing so it can be checked
 * against the file that was sent. That is only worth showing if it is the same
 * number the server stores, so the two must agree byte for byte.
 * lib/policy.ts uses node:crypto and cannot be imported into a client bundle.
 */
export async function bundleVerWeb(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `file:${hex.slice(0, 12)}`;
}
