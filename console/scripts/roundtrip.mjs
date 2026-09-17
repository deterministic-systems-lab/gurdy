/**
 * A stored export must stream back byte-identical and pass gurdy-verify.
 * Re-serializing JSON would change byte order and break the hash chain.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const repo = path.join(import.meta.dirname, "..", "..");
const seedDir = path.join(repo, "seed-ledger");
const verifier = path.join(repo, "bin", "gurdy-verify");

function splitJsonl(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      lines.push(buf.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < buf.length) {
    lines.push(buf.subarray(start));
  }
  return lines;
}

function verifyBytes(bytes, name) {
  const dir = mkdtempSync(path.join(tmpdir(), "gurdy-roundtrip-"));
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  const ran = spawnSync(verifier, ["-json", file], { encoding: "utf8" });
  if (ran.status !== 0) {
    throw new Error(`gurdy-verify failed on ${name}:\n${ran.stdout}${ran.stderr}`);
  }
}

function assertIdentical(got, want, label) {
  if (!Buffer.from(got).equals(Buffer.from(want))) {
    throw new Error(`${label}: streamed bytes differ from the original export`);
  }
}

let failed = 0;
for (const name of readdirSync(seedDir).filter((f) => f.endsWith(".jsonl"))) {
  const want = readFileSync(path.join(seedDir, name));
  const got = Buffer.concat(splitJsonl(want));
  try {
    assertIdentical(got, want, `local ${name}`);
    verifyBytes(got, name);
    console.log("ok local", name);
  } catch (err) {
    failed += 1;
    console.error(err.message);
  }
}

if (process.env.DATABASE_URL) {
  const sql = neon(process.env.DATABASE_URL);
  const chains = await sql`
    SELECT id, partition FROM chains ORDER BY partition
  `;
  if (chains.length === 0) {
    console.log("skip db: no stored chains");
  }
  for (const chain of chains) {
    const rows = await sql`
      SELECT raw FROM ledger_lines WHERE chain_id = ${chain.id} ORDER BY seq
    `;
    const got = rows.map((r) => r.raw).join("");
    const seedPath = path.join(seedDir, chain.partition);
    try {
      verifyBytes(Buffer.from(got, "utf8"), chain.partition);
      if (readdirSync(seedDir).includes(chain.partition)) {
        const want = readFileSync(seedPath);
        assertIdentical(got, want, `db ${chain.partition}`);
      }
      console.log("ok db", chain.partition, got.length, "bytes");
    } catch (err) {
      failed += 1;
      console.error(err.message);
    }
  }
} else {
  console.log("skip db: DATABASE_URL unset");
}

if (failed) {
  process.exit(1);
}
console.log("roundtrip ok");
