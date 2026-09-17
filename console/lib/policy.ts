import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executableBin, runBin } from "@/lib/bin";

const FRAME =
  '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/tmp/x"}}}\n';

export function bundleVer(raw: Buffer | string): string {
  const buf = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  const hash12 = createHash("sha256").update(buf).digest("hex").slice(0, 12);
  return `file:${hash12}`;
}

/** Same shape as scripts/replay_corpus.py: start the proxy on the candidate. */
export async function compileCheck(
  cedar: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "gurdy-policy-"));
  try {
    const policy = path.join(dir, "candidate.cedar");
    const ledger = path.join(dir, "ledger");
    const state = path.join(dir, "state");
    await writeFile(policy, cedar);
    await mkdir(ledger);
    await mkdir(state);
    const bin = await executableBin("proxy");
    const ran = await runBin(
      bin,
      [
        "-stdio",
        "-tenant",
        "local",
        "-deploy-id",
        "policy-check",
        "-ledger-dir",
        ledger,
        "-state-dir",
        state,
        "-tis-socket",
        "off",
        "-policy",
        policy,
        "--",
        "cat",
      ],
      { input: FRAME, timeoutMs: 20_000 },
    );
    const output = `${ran.stdout}\n${ran.stderr}`;
    if (ran.code !== 0) {
      return { ok: false, error: output.trim().slice(0, 2000) || `gurdy-proxy exit ${ran.code}` };
    }
    return { ok: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
