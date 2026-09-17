import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "@/lib/db";
import { executableBin, runBin } from "@/lib/bin";
import {
  headerFromPrefix,
  joinJsonl,
  parseRecord,
  pkixToPem,
  splitJsonl,
  type LedgerRecord,
} from "@/lib/ledger";
import { hashToken } from "@/lib/token";

export class IngestError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "ingest failed"));
  }
}

type TokenRow = {
  id: string;
  user_id: number;
  device_id: string | null;
};

type DeviceRow = {
  id: string;
  user_id: number;
  kid: string;
  pubkey: string;
  revoked_at: string | null;
};

type ChainRow = {
  id: string;
  device_id: string;
  partition: string;
  byte_len: string | number;
};

export type IngestBody = {
  partition: string;
  offset: number;
  kid: string;
  bytes: string;
};

export type IngestResult = {
  ok: true;
  offset: number;
  last_seq: number;
  head_hash: string;
};

type VerifyExport = {
  file: string;
  ok: boolean;
  error?: string;
  records?: number;
  decisions?: number;
  answered?: number;
  unmatched?: number;
  dropped?: number;
  write_errors?: number;
  identity_failed?: number;
  clean_end?: boolean | null;
  liveness_gaps?: number;
  unclean_restarts?: number;
  tenant?: string;
  workload?: string;
  instance_id?: string;
  producer?: string;
  schema_version?: number;
  last_seq?: number;
  head_hash?: string;
  segment?: number;
  continues_from?: string;
  pruned?: number;
};

export async function listOffsets(bearer: string) {
  const token = await loadToken(bearer);
  const db = sql();
  return db`
    SELECT c.partition, c.byte_len AS offset, d.kid
    FROM chains c
    JOIN devices d ON d.id = c.device_id
    WHERE d.user_id = ${token.user_id}
    ORDER BY c.partition
  `;
}

export async function ingest(bearer: string, body: IngestBody): Promise<IngestResult> {
  const token = await loadToken(bearer);
  const suffix = Buffer.from(body.bytes, "utf8");
  const db = sql();

  const device: DeviceRow | null = await loadDevice(token.user_id, body.kid);
  const chain: ChainRow | null = device
    ? await loadChain(device.id, body.partition)
    : null;

  const expected = chain ? Number(chain.byte_len) : 0;
  if (body.offset !== expected) {
    throw new IngestError(409, {
      error: "offset_mismatch",
      offset: expected,
    });
  }

  const stored = chain ? await loadStoredLines(chain.id) : [];
  const reconstructed = joinJsonl([...stored, ...splitJsonl(suffix)]);
  if (reconstructed.length === 0) {
    return { ok: true, offset: 0, last_seq: 0, head_hash: "" };
  }

  const header = headerFromPrefix(reconstructed);
  if (header.kid !== body.kid) {
    throw new IngestError(400, { error: "kid in body does not match header" });
  }
  if (!header.pubkey) {
    throw new IngestError(400, { error: "header has no pubkey" });
  }

  if (device) {
    if (device.revoked_at) {
      throw new IngestError(403, { error: "device revoked" });
    }
    if (device.pubkey !== header.pubkey) {
      await recordAttempt(token.user_id, device.id, body.partition, false, "pubkey mismatch", "");
      throw new IngestError(403, { error: "pubkey does not match the pinned key" });
    }
  } else {
    const taken = await db`
      SELECT user_id FROM devices WHERE kid = ${body.kid} LIMIT 1
    ` as { user_id: number }[];
    if (taken.length && Number(taken[0].user_id) !== Number(token.user_id)) {
      throw new IngestError(403, { error: "kid is pinned to another account" });
    }
  }

  const pinnedPem = pkixToPem(device?.pubkey ?? header.pubkey);
  const verified = await verifyReconstructed(body.partition, reconstructed, pinnedPem);
  if (!verified.ok) {
    await recordAttempt(
      token.user_id,
      device?.id ?? null,
      body.partition,
      false,
      verified.error,
      verified.output,
    );
    throw new IngestError(400, {
      error: "verify_failed",
      detail: verified.error,
    });
  }

  const deviceId = await persistSuccess({
    token,
    device,
    partition: body.partition,
    kid: body.kid,
    pubkey: header.pubkey,
    suffix,
    reconstructed,
    export: verified.exp,
  });
  await recordAttempt(token.user_id, deviceId, body.partition, true, null, verified.output);
  return {
    ok: true,
    offset: reconstructed.length,
    last_seq: verified.exp.last_seq ?? 0,
    head_hash: verified.exp.head_hash ?? "",
  };
}

async function loadToken(bearer: string): Promise<TokenRow> {
  const db = sql();
  const rows = (await db`
    SELECT id, user_id, device_id
    FROM device_tokens
    WHERE token_hash = ${hashToken(bearer)}
    LIMIT 1
  `) as TokenRow[];
  if (!rows[0]) {
    throw new IngestError(401, { error: "invalid device token" });
  }
  return rows[0];
}

async function loadDevice(userId: number, kid: string): Promise<DeviceRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT id, user_id, kid, pubkey, revoked_at
    FROM devices
    WHERE user_id = ${userId} AND kid = ${kid}
    LIMIT 1
  `) as DeviceRow[];
  return rows[0] ?? null;
}

async function loadChain(deviceId: string, partition: string): Promise<ChainRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT id, device_id, partition, byte_len
    FROM chains
    WHERE device_id = ${deviceId} AND partition = ${partition}
    LIMIT 1
  `) as ChainRow[];
  return rows[0] ?? null;
}

async function loadStoredLines(chainId: string): Promise<Buffer[]> {
  const db = sql();
  const rows = (await db`
    SELECT raw FROM ledger_lines
    WHERE chain_id = ${chainId}
    ORDER BY seq
  `) as { raw: string }[];
  return rows.map((r) => Buffer.from(r.raw, "utf8"));
}

async function verifyReconstructed(
  partition: string,
  reconstructed: Buffer,
  pem: string,
): Promise<{ ok: true; exp: VerifyExport; output: string } | { ok: false; error: string; output: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "gurdy-ingest-"));
  try {
    const file = path.join(/*turbopackIgnore: true*/ dir, path.basename(partition) || "export.jsonl");
    const pemPath = path.join(/*turbopackIgnore: true*/ dir, "pinned.pem");
    await writeFile(file, reconstructed);
    await writeFile(pemPath, pem);
    const bin = await executableBin("verify");
    const ran = await runBin(bin, ["-json", "-pubkey", pemPath, file]);
    const output = `${ran.stdout}${ran.stderr}`;
    let parsed: { exports?: VerifyExport[]; seams?: string[] } = {};
    try {
      parsed = JSON.parse(ran.stdout) as { exports?: VerifyExport[]; seams?: string[] };
    } catch {
      return { ok: false, error: output || `gurdy-verify exit ${ran.code}`, output };
    }
    const exp = parsed.exports?.[0];
    const seams = parsed.seams ?? [];
    if (ran.code !== 0 || !exp?.ok || seams.length) {
      return {
        ok: false,
        error: exp?.error || seams.join("; ") || `gurdy-verify exit ${ran.code}`,
        output,
      };
    }
    return { ok: true, exp, output };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function persistSuccess(args: {
  token: TokenRow;
  device: DeviceRow | null;
  partition: string;
  kid: string;
  pubkey: string;
  suffix: Buffer;
  reconstructed: Buffer;
  export: VerifyExport;
}): Promise<string> {
  const db = sql();
  const exp = args.export;
  const newLines = splitJsonl(args.suffix);

  let deviceId = args.device?.id ?? null;
  if (!deviceId) {
    const created = (await db`
      INSERT INTO devices (user_id, kid, pubkey)
      VALUES (${args.token.user_id}, ${args.kid}, ${args.pubkey})
      RETURNING id
    `) as { id: string }[];
    deviceId = created[0].id;
  }

  await db.transaction((txn) => {
    const out = [upsertChain(txn, deviceId, args.partition, args.reconstructed.length, exp)];
    for (const line of newLines) {
      const rec = parseRecord(line);
      out.push(txn`
        INSERT INTO ledger_lines (chain_id, seq, raw)
        VALUES (
          (SELECT id FROM chains WHERE device_id = ${deviceId} AND partition = ${args.partition}),
          ${rec.seq},
          ${line.toString("utf8")}
        )
      `);
      if (rec.kind === "decision") {
        out.push(decisionInsert(txn, deviceId, args.partition, rec));
      }
    }
    out.push(txn`
      UPDATE device_tokens
      SET last_used_at = now(), device_id = COALESCE(device_id, ${deviceId})
      WHERE id = ${args.token.id}
    `);
    return out as never;
  });

  return deviceId;
}

function upsertChain(
  txn: { (strings: TemplateStringsArray, ...params: unknown[]): unknown },
  deviceId: string,
  partition: string,
  byteLen: number,
  exp: VerifyExport,
) {
  return txn`
    INSERT INTO chains (
      device_id, partition, byte_len, head_hash, last_seq, segment,
      records, decisions_count, answered, unmatched,
      dropped, write_errors, identity_failed,
      clean_end, liveness_gaps, unclean_restarts,
      tenant, workload, instance_id, producer, schema_version,
      continues_from, pruned, updated_at
    )
    VALUES (
      ${deviceId}, ${partition}, ${byteLen},
      ${exp.head_hash ?? null}, ${exp.last_seq ?? null}, ${exp.segment ?? 1},
      ${exp.records ?? null}, ${exp.decisions ?? null}, ${exp.answered ?? null},
      ${exp.unmatched ?? null}, ${exp.dropped ?? 0}, ${exp.write_errors ?? 0},
      ${exp.identity_failed ?? 0}, ${exp.clean_end ?? null},
      ${exp.liveness_gaps ?? 0}, ${exp.unclean_restarts ?? 0},
      ${exp.tenant ?? null}, ${exp.workload ?? null}, ${exp.instance_id ?? null},
      ${exp.producer ?? null}, ${exp.schema_version ?? null},
      ${exp.continues_from ?? null}, ${exp.pruned ?? 0}, now()
    )
    ON CONFLICT (device_id, partition) DO UPDATE SET
      byte_len = EXCLUDED.byte_len,
      head_hash = EXCLUDED.head_hash,
      last_seq = EXCLUDED.last_seq,
      segment = EXCLUDED.segment,
      records = EXCLUDED.records,
      decisions_count = EXCLUDED.decisions_count,
      answered = EXCLUDED.answered,
      unmatched = EXCLUDED.unmatched,
      dropped = EXCLUDED.dropped,
      write_errors = EXCLUDED.write_errors,
      identity_failed = EXCLUDED.identity_failed,
      clean_end = EXCLUDED.clean_end,
      liveness_gaps = EXCLUDED.liveness_gaps,
      unclean_restarts = EXCLUDED.unclean_restarts,
      tenant = EXCLUDED.tenant,
      workload = EXCLUDED.workload,
      instance_id = EXCLUDED.instance_id,
      producer = EXCLUDED.producer,
      schema_version = EXCLUDED.schema_version,
      continues_from = EXCLUDED.continues_from,
      pruned = EXCLUDED.pruned,
      updated_at = now()
  `;
}

function decisionInsert(
  txn: { (strings: TemplateStringsArray, ...params: unknown[]): unknown },
  deviceId: string,
  partition: string,
  rec: LedgerRecord,
) {
  return txn`
    INSERT INTO decisions (
      chain_id, seq, ts, call_id, txn_id, assertion_jti, assertion_status,
      principal, principal_tier, asserted_human_actor, tool, action,
      resource_attrs, decision, policy_mode, action_applied, policy_effects,
      bundle_ver, req_hash
    )
    VALUES (
      (SELECT id FROM chains WHERE device_id = ${deviceId} AND partition = ${partition}),
      ${rec.seq},
      ${rec.ts ?? null},
      ${rec.call_id ?? null},
      ${rec.txn_id ?? null},
      ${rec.assertion_jti ?? null},
      ${rec.assertion_status ?? null},
      ${rec.principal ?? null},
      ${rec.principal_tier ?? null},
      ${rec.asserted_human_actor ?? null},
      ${rec.tool ?? null},
      ${rec.action ?? null},
      ${JSON.stringify(rec.resource_attrs ?? {})},
      ${rec.decision ?? null},
      ${rec.policy_mode ?? null},
      ${rec.action_applied ?? null},
      ${JSON.stringify(rec.policy_effects ?? [])},
      ${rec.bundle_ver ?? null},
      ${rec.req_hash ?? null}
    )
  `;
}

async function recordAttempt(
  userId: number,
  deviceId: string | null,
  partition: string,
  ok: boolean,
  error: string | null,
  verifierOutput: string,
): Promise<void> {
  const db = sql();
  await db`
    INSERT INTO ingest_attempts (user_id, device_id, partition, ok, error, verifier_output)
    VALUES (${userId}, ${deviceId}, ${partition}, ${ok}, ${error}, ${verifierOutput})
  `;
}
