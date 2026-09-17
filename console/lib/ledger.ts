export type LedgerRecord = {
  kind: string;
  seq: number;
  kid?: string;
  pubkey?: string;
  ts?: string;
  call_id?: string;
  txn_id?: string;
  assertion_jti?: string;
  assertion_status?: string;
  principal?: string;
  principal_tier?: string;
  asserted_human_actor?: string;
  tool?: string;
  action?: string;
  resource_attrs?: Record<string, string>;
  decision?: string;
  policy_mode?: string;
  action_applied?: string;
  policy_effects?: unknown;
  bundle_ver?: string;
  req_hash?: string;
};

export function splitJsonl(buf: Buffer): Buffer[] {
  const lines: Buffer[] = [];
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

export function joinJsonl(lines: Buffer[]): Buffer {
  return Buffer.concat(lines);
}

export function parseRecord(line: Buffer): LedgerRecord {
  const text = line.toString("utf8").replace(/\n$/, "");
  return JSON.parse(text) as LedgerRecord;
}

export function headerFromPrefix(buf: Buffer): LedgerRecord {
  const lines = splitJsonl(buf);
  if (lines.length === 0) {
    throw new Error("empty ledger prefix");
  }
  const rec = parseRecord(lines[0]);
  if (rec.kind !== "header") {
    throw new Error("first record is not a header");
  }
  return rec;
}

/** Wrap a header pubkey (base64 PKIX) as PEM for gurdy-verify -pubkey. */
export function pkixToPem(b64: string): string {
  const compact = b64.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;
}
