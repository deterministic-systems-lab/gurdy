import { sql } from "@/lib/db";
import { deviceLag, STALE_AFTER_S, type Lag } from "@/lib/fleet-lag";
import { hashToken } from "@/lib/token";
import { listPeople, listPolicySets, resolvePack } from "@/lib/policy-sets";
import type { PersonPack, PolicySetRow } from "@/lib/policy-sets";

export { deviceLag, STALE_AFTER_S, type Lag };

export type Desired = {
  bundle_ver: string | null;
  cedar: string | null;
  enforce: boolean;
  updated_at: Date | null;
  policy_name: string | null;
  assigned: boolean;
};

export type DeviceRow = {
  id: string;
  user_id: number;
  kid: string;
  email: string | null;
  revoked_at: Date | null;
  hostname: string | null;
  os: string | null;
  shipper: string | null;
  observed_bundle_ver: string | null;
  policy_path: string | null;
  enforce_applied: boolean | null;
  ledgers: unknown;
  surfaces: unknown;
  git_head: string | null;
  asserted_conversation_id: string | null;
  last_seen_at: Date | null;
  assigned_policy_name: string | null;
  desired_policy_name: string | null;
  desired_bundle_ver: string | null;
};

export type FleetDevice = DeviceRow & { lag: Lag[] };

export async function loadDesired(userId?: number | null): Promise<Desired> {
  const db = sql();
  const pack = await resolvePack(userId);
  const mode = (await db`
    SELECT enforce, updated_at FROM fleet_desired WHERE id = 1 LIMIT 1
  `) as { enforce: boolean; updated_at: Date }[];
  return {
    bundle_ver: pack.bundle_ver,
    cedar: pack.cedar,
    enforce: Boolean(mode[0]?.enforce),
    updated_at: mode[0]?.updated_at ?? null,
    policy_name: pack.name,
    assigned: pack.assigned,
  };
}

export async function setEnforce(enforce: boolean, email: string): Promise<Desired> {
  const db = sql();
  await db`
    INSERT INTO fleet_desired (id, enforce, updated_by, updated_at)
    VALUES (1, ${enforce}, ${email}, now())
    ON CONFLICT (id) DO UPDATE SET
      enforce = EXCLUDED.enforce,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
  return loadDesired();
}

export async function listFleet(nowMs: number = Date.now()): Promise<{
  desired: Omit<Desired, "cedar">;
  policy_sets: PolicySetRow[];
  people: PersonPack[];
  stale_after_s: number;
  devices: FleetDevice[];
}> {
  const [desired, policy_sets, people] = await Promise.all([
    loadDesired(),
    listPolicySets(),
    listPeople(),
  ]);
  const db = sql();
  const rows = (await db`
    SELECT
      d.id, d.user_id, d.kid, d.revoked_at, u.email,
      r.hostname, r.os, r.shipper, r.observed_bundle_ver, r.policy_path,
      r.enforce_applied, r.ledgers, r.surfaces, r.git_head,
      r.asserted_conversation_id, r.last_seen_at,
      up.policy_name AS assigned_policy_name,
      COALESCE(ps.name, def.name) AS desired_policy_name,
      COALESCE(ps.bundle_ver, def.bundle_ver) AS desired_bundle_ver
    FROM devices d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN device_reports r ON r.device_id = d.id
    LEFT JOIN user_policies up ON up.user_id = d.user_id
    LEFT JOIN policy_sets ps ON ps.name = up.policy_name
    LEFT JOIN policy_sets def ON def.is_default
    ORDER BY r.last_seen_at DESC NULLS LAST, d.created_at DESC
  `) as DeviceRow[];
  return {
    desired: {
      bundle_ver: desired.bundle_ver,
      enforce: desired.enforce,
      updated_at: desired.updated_at,
      policy_name: desired.policy_name,
      assigned: false,
    },
    policy_sets,
    people,
    stale_after_s: STALE_AFTER_S,
    devices: rows.map((row) => ({
      ...row,
      enforce_applied: row.enforce_applied ?? null,
      lag: deviceLag(
        row,
        {
          bundle_ver: row.desired_bundle_ver,
          enforce: desired.enforce,
        },
        nowMs,
      ),
    })),
  };
}

export type DeviceTokenRow = {
  id: string;
  user_id: number;
  device_id: string | null;
};

export async function loadDeviceToken(bearer: string): Promise<DeviceTokenRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT id, user_id, device_id
    FROM device_tokens
    WHERE token_hash = ${hashToken(bearer)}
    LIMIT 1
  `) as DeviceTokenRow[];
  return rows[0] ?? null;
}

export type HeartbeatBody = {
  kid: string;
  hostname?: string;
  os?: string;
  shipper?: string;
  observed_bundle_ver?: string;
  policy_path?: string;
  enforce_applied?: boolean;
  ledgers?: unknown;
  surfaces?: unknown;
  git_head?: string;
  asserted_conversation_id?: string;
};

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const t = value.trim();
  if (!t) {
    return null;
  }
  return t.slice(0, max);
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value.slice(0, max)) {
    const s = clip(item, 128);
    if (s) {
      out.push(s);
    }
  }
  return out;
}

export async function recordHeartbeat(
  token: DeviceTokenRow,
  body: HeartbeatBody,
): Promise<{ ok: true; device_id: string }> {
  const kid = clip(body.kid, 128);
  if (!kid) {
    throw new FleetError(400, { error: "kid is required" });
  }
  const db = sql();
  const devices = (await db`
    SELECT id, kid FROM devices
    WHERE user_id = ${token.user_id} AND kid = ${kid}
    LIMIT 1
  `) as { id: string; kid: string }[];
  if (!devices[0]) {
    throw new FleetError(409, { error: "device_not_pinned" });
  }
  const deviceId = devices[0].id;
  if (token.device_id && token.device_id !== deviceId) {
    throw new FleetError(403, { error: "kid does not match this token's device" });
  }

  const ledgers = JSON.stringify(stringList(body.ledgers, 32));
  const surfaces =
    body.surfaces && typeof body.surfaces === "object" && !Array.isArray(body.surfaces)
      ? JSON.stringify(body.surfaces)
      : "{}";

  await db`
    INSERT INTO device_reports (
      device_id, hostname, os, shipper, observed_bundle_ver, policy_path,
      enforce_applied, ledgers, surfaces, git_head, asserted_conversation_id, last_seen_at
    )
    VALUES (
      ${deviceId},
      ${clip(body.hostname, 255)},
      ${clip(body.os, 64)},
      ${clip(body.shipper, 32)},
      ${clip(body.observed_bundle_ver, 64)},
      ${clip(body.policy_path, 512)},
      ${Boolean(body.enforce_applied)},
      ${ledgers}::jsonb,
      ${surfaces}::jsonb,
      ${clip(body.git_head, 64)},
      ${clip(body.asserted_conversation_id, 128)},
      now()
    )
    ON CONFLICT (device_id) DO UPDATE SET
      hostname = EXCLUDED.hostname,
      os = EXCLUDED.os,
      shipper = EXCLUDED.shipper,
      observed_bundle_ver = EXCLUDED.observed_bundle_ver,
      policy_path = EXCLUDED.policy_path,
      enforce_applied = EXCLUDED.enforce_applied,
      ledgers = EXCLUDED.ledgers,
      surfaces = EXCLUDED.surfaces,
      git_head = EXCLUDED.git_head,
      asserted_conversation_id = EXCLUDED.asserted_conversation_id,
      last_seen_at = now()
  `;
  await db`
    UPDATE device_tokens
    SET last_used_at = now(), device_id = COALESCE(device_id, ${deviceId})
    WHERE id = ${token.id}
  `;
  return { ok: true, device_id: deviceId };
}

export async function revokeDevice(id: string): Promise<{ ok: true } | { error: string }> {
  const db = sql();
  const rows = (await db`
    UPDATE devices
    SET revoked_at = now()
    WHERE id = ${id} AND revoked_at IS NULL
    RETURNING id
  `) as { id: string }[];
  if (!rows[0]) {
    return { error: "not found or already revoked" };
  }
  return { ok: true };
}

export class FleetError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "fleet error"));
  }
}
