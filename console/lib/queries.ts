import { sql } from "@/lib/db";
import { accessSurface, asCountRow, type InventoryCount } from "@/lib/inventory";

export type ChainSummary = {
  id: string;
  partition: string;
  kid: string;
  last_seq: string | number | null;
  byte_len: string | number;
  records: number | null;
  decisions_count: number | null;
  answered: number | null;
  unmatched: number | null;
  dropped: string | number | null;
  write_errors: string | number | null;
  identity_failed: string | number | null;
  clean_end: boolean | null;
  liveness_gaps: number | null;
  unclean_restarts: number | null;
  tenant: string | null;
  workload: string | null;
  instance_id: string | null;
  producer: string | null;
  updated_at: Date;
};

export type DecisionRow = {
  id: string;
  chain_id: string;
  partition: string;
  kid: string;
  seq: string | number;
  ts: string | null;
  call_id: string | null;
  assertion_status: string | null;
  principal: string | null;
  principal_tier: string | null;
  asserted_human_actor: string | null;
  tool: string | null;
  action: string | null;
  resource_attrs: Record<string, string> | null;
  decision: string | null;
  policy_mode: string | null;
  action_applied: string | null;
  policy_effects: unknown;
  bundle_ver: string | null;
};

export type EstateDecision = DecisionRow & { email: string | null };

export type EstateInventory = {
  totals: InventoryCount;
  tools: InventoryCount[];
  services: (InventoryCount & { surface: "native" | "wrap" })[];
  rules: InventoryCount[];
  recentBlocks: EstateDecision[];
};

/**
 * What a device's already-verified pushes say about it. This is history, not
 * running state: the heartbeat in lib/fleet.ts is the only "actual". Keyed by
 * device so the fleet page can hang it off GET /api/fleet.
 */
export type LedgerFacts = {
  device_id: string;
  created_at: Date;
  partitions: number;
  records: number;
  decisions: number;
  last_push: Date | null;
  instances: string[];
  producers: string[];
  workloads: string[];
  last_decision_bundle: string | null;
  violations: number;
  enforced: number;
};

export type PendingInstall = {
  owner: string;
  tokens: number;
  last_minted: Date;
};

/**
 * Admin view: every device on the tenant, not scoped to one user. Gate the
 * caller on isAdmin, because this deliberately crosses account boundaries.
 */
export async function ledgerFacts(): Promise<LedgerFacts[]> {
  const db = sql();
  return (await db`
    SELECT
      d.id AS device_id,
      d.created_at,
      COALESCE(ship.partitions, 0) AS partitions,
      COALESCE(ship.records, 0) AS records,
      COALESCE(ship.decisions, 0) AS decisions,
      ship.last_push,
      COALESCE(ship.instances, ARRAY[]::text[]) AS instances,
      COALESCE(ship.producers, ARRAY[]::text[]) AS producers,
      COALESCE(ship.workloads, ARRAY[]::text[]) AS workloads,
      COALESCE(pack.violations, 0) AS violations,
      COALESCE(pack.enforced, 0) AS enforced,
      (
        SELECT dec.bundle_ver
        FROM decisions dec
        JOIN chains c ON c.id = dec.chain_id
        WHERE c.device_id = d.id AND dec.bundle_ver IS NOT NULL
        ORDER BY dec.ts DESC NULLS LAST, dec.seq DESC
        LIMIT 1
      ) AS last_decision_bundle
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT
        count(*)::int AS partitions,
        max(c.updated_at) AS last_push,
        sum(COALESCE(c.records, 0))::int AS records,
        sum(COALESCE(c.decisions_count, 0))::int AS decisions,
        array_agg(DISTINCT c.instance_id) FILTER (WHERE c.instance_id <> '') AS instances,
        array_agg(DISTINCT c.producer) FILTER (WHERE c.producer <> '') AS producers,
        array_agg(DISTINCT c.workload) FILTER (WHERE c.workload <> '') AS workloads
      FROM chains c
      WHERE c.device_id = d.id
    ) ship ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE dec.decision = 'block')::int AS violations,
        count(*) FILTER (WHERE dec.action_applied IN ('blocked', 'rewritten'))::int AS enforced
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      WHERE c.device_id = d.id
    ) pack ON true
  `) as LedgerFacts[];
}

/**
 * Accounts holding a token that has never been presented, and that have no
 * device at all: minted but never installed.
 */
export async function pendingInstalls(): Promise<PendingInstall[]> {
  const db = sql();
  return (await db`
    SELECT
      u.email AS owner,
      count(*)::int AS tokens,
      max(t.created_at) AS last_minted
    FROM device_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.device_id IS NULL
      AND t.last_used_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = t.user_id)
    GROUP BY u.email
    ORDER BY max(t.created_at) DESC
  `) as PendingInstall[];
}

export async function chainsForUser(userId: string): Promise<ChainSummary[]> {
  const db = sql();
  return (await db`
    SELECT
      c.id, c.partition, d.kid, c.last_seq, c.byte_len, c.records,
      c.decisions_count, c.answered, c.unmatched, c.dropped, c.write_errors,
      c.identity_failed, c.clean_end, c.liveness_gaps, c.unclean_restarts,
      c.tenant, c.workload, c.instance_id, c.producer, c.updated_at
    FROM chains c
    JOIN devices d ON d.id = c.device_id
    WHERE d.user_id = ${userId}
    ORDER BY c.updated_at DESC
  `) as ChainSummary[];
}

export async function chainForUser(
  userId: string,
  chainId: string,
): Promise<ChainSummary | null> {
  const db = sql();
  const rows = (await db`
    SELECT
      c.id, c.partition, d.kid, c.last_seq, c.byte_len, c.records,
      c.decisions_count, c.answered, c.unmatched, c.dropped, c.write_errors,
      c.identity_failed, c.clean_end, c.liveness_gaps, c.unclean_restarts,
      c.tenant, c.workload, c.instance_id, c.producer, c.updated_at
    FROM chains c
    JOIN devices d ON d.id = c.device_id
    WHERE d.user_id = ${userId} AND c.id = ${chainId}
    LIMIT 1
  `) as ChainSummary[];
  return rows[0] ?? null;
}

export async function decisionsForUser(
  userId: string,
  opts: { chainId?: string; blockedOnly?: boolean } = {},
): Promise<DecisionRow[]> {
  const db = sql();
  if (opts.chainId && opts.blockedOnly) {
    return (await db`
      SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
        dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
        dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
        dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
        dec.bundle_ver
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      JOIN devices d ON d.id = c.device_id
      WHERE d.user_id = ${userId} AND c.id = ${opts.chainId} AND dec.decision = 'block'
      ORDER BY dec.ts DESC NULLS LAST, dec.seq DESC
    `) as DecisionRow[];
  }
  if (opts.chainId) {
    return (await db`
      SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
        dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
        dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
        dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
        dec.bundle_ver
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      JOIN devices d ON d.id = c.device_id
      WHERE d.user_id = ${userId} AND c.id = ${opts.chainId}
      ORDER BY dec.seq
    `) as DecisionRow[];
  }
  if (opts.blockedOnly) {
    return (await db`
      SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
        dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
        dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
        dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
        dec.bundle_ver
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      JOIN devices d ON d.id = c.device_id
      WHERE d.user_id = ${userId} AND dec.decision = 'block'
      ORDER BY dec.ts DESC NULLS LAST, dec.seq DESC
    `) as DecisionRow[];
  }
  return (await db`
    SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
      dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
      dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
      dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
      dec.bundle_ver
    FROM decisions dec
    JOIN chains c ON c.id = dec.chain_id
    JOIN devices d ON d.id = c.device_id
    WHERE d.user_id = ${userId}
    ORDER BY dec.ts DESC NULLS LAST, dec.seq DESC
  `) as DecisionRow[];
}

/**
 * One decision, scoped to its owner. Explain takes an id straight from the
 * client, so the join to devices is what stops it reading someone else's row.
 */
export async function decisionForUser(
  userId: string,
  id: string,
): Promise<DecisionRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
      dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
      dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
      dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
      dec.bundle_ver
    FROM decisions dec
    JOIN chains c ON c.id = dec.chain_id
    JOIN devices d ON d.id = c.device_id
    WHERE d.user_id = ${userId} AND dec.id = ${id}
  `) as DecisionRow[];
  return rows[0] ?? null;
}

/** One decision by id. Callers that cross accounts must already be admin. */
export async function decisionById(id: string): Promise<DecisionRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
      dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
      dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
      dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
      dec.bundle_ver
    FROM decisions dec
    JOIN chains c ON c.id = dec.chain_id
    JOIN devices d ON d.id = c.device_id
    WHERE dec.id = ${id}
  `) as DecisionRow[];
  return rows[0] ?? null;
}

export async function lastAttempt(userId: string) {
  const db = sql();
  const rows = (await db`
    SELECT ok, partition, error, created_at
    FROM ingest_attempts
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as {
    ok: boolean;
    partition: string | null;
    error: string | null;
    created_at: Date;
  }[];
  return rows[0] ?? null;
}

/**
 * Estate-wide access inventory. Gate the caller on isAdmin — this crosses
 * account boundaries. Counts are decided calls ingest accepted, not coverage.
 */
export async function estateInventory(): Promise<EstateInventory> {
  const db = sql();
  const [totalsRows, toolRows, serviceRows, ruleRows, recentBlocks] = await Promise.all([
    db`
      SELECT
        '(all)' AS key,
        count(*)::int AS calls,
        count(*) FILTER (WHERE decision = 'block')::int AS violations,
        count(*) FILTER (WHERE action_applied IN ('blocked', 'rewritten'))::int AS stopped
      FROM decisions
    ` as Promise<Record<string, unknown>[]>,
    db`
      SELECT
        COALESCE(NULLIF(tool, ''), action, '(unnamed)') AS key,
        count(*)::int AS calls,
        count(*) FILTER (WHERE decision = 'block')::int AS violations,
        count(*) FILTER (WHERE action_applied IN ('blocked', 'rewritten'))::int AS stopped
      FROM decisions
      GROUP BY 1
      ORDER BY count(*) DESC, 1
    ` as Promise<Record<string, unknown>[]>,
    db`
      SELECT
        c.partition AS key,
        count(*)::int AS calls,
        count(*) FILTER (WHERE dec.decision = 'block')::int AS violations,
        count(*) FILTER (WHERE dec.action_applied IN ('blocked', 'rewritten'))::int AS stopped
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      GROUP BY c.partition
      ORDER BY count(*) DESC, c.partition
    ` as Promise<Record<string, unknown>[]>,
    db`
      SELECT
        COALESCE(fx.policy_id, '(none)') AS key,
        count(*)::int AS calls,
        count(*) FILTER (WHERE dec.decision = 'block')::int AS violations,
        count(*) FILTER (WHERE dec.action_applied IN ('blocked', 'rewritten'))::int AS stopped
      FROM decisions dec
      CROSS JOIN LATERAL (
        SELECT e->>'policy_id' AS policy_id
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(dec.policy_effects) = 'array'
                 AND jsonb_array_length(dec.policy_effects) > 0
              THEN dec.policy_effects
            ELSE '[{"policy_id":null}]'::jsonb
          END
        ) e
      ) fx
      GROUP BY 1
      ORDER BY count(*) DESC, 1
    ` as Promise<Record<string, unknown>[]>,
    db`
      SELECT dec.id, dec.chain_id, c.partition, d.kid, dec.seq, dec.ts,
        dec.call_id, dec.assertion_status, dec.principal, dec.principal_tier,
        dec.asserted_human_actor, dec.tool, dec.action, dec.resource_attrs,
        dec.decision, dec.policy_mode, dec.action_applied, dec.policy_effects,
        dec.bundle_ver, u.email
      FROM decisions dec
      JOIN chains c ON c.id = dec.chain_id
      JOIN devices d ON d.id = c.device_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE dec.decision = 'block'
      ORDER BY dec.ts DESC NULLS LAST, dec.seq DESC
      LIMIT 80
    ` as unknown as Promise<EstateDecision[]>,
    // ^ through unknown: the driver's row type is Record<string, any>[], which
    // the looser casts above satisfy but a named row type does not.
  ]);

  const totals = asCountRow(totalsRows[0] ?? {});
  return {
    totals,
    tools: toolRows.map(asCountRow),
    services: serviceRows.map((row) => {
      const count = asCountRow(row);
      return { ...count, surface: accessSurface(count.key) };
    }),
    rules: ruleRows.map(asCountRow),
    recentBlocks,
  };
}

/** Same set the reporter scores as stopped. `stopped` itself is not one. */
const STOPPED_APPLIED = new Set(["blocked", "rewritten"]);

export function counts(rows: DecisionRow[]) {
  const violations = rows.filter((r) => r.decision === "block").length;
  const stopped = rows.filter((r) =>
    STOPPED_APPLIED.has(r.action_applied ?? ""),
  ).length;
  return { violations, stopped };
}
