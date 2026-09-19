import { sql } from "@/lib/db";
import { normalizePolicyName } from "@/lib/policy-name";

export type PolicySetRow = {
  name: string;
  bundle_ver: string;
  is_default: boolean;
  updated_at: Date;
};

export type PersonPack = {
  user_id: number;
  email: string;
  assigned_name: string | null;
};

export type ResolvedPack = {
  name: string | null;
  bundle_ver: string | null;
  cedar: string | null;
  assigned: boolean;
};

export async function listPolicySets(): Promise<PolicySetRow[]> {
  const db = sql();
  return (await db`
    SELECT name, bundle_ver, is_default, updated_at
    FROM policy_sets
    ORDER BY is_default DESC, name
  `) as PolicySetRow[];
}

export async function listPeople(): Promise<PersonPack[]> {
  const db = sql();
  return (await db`
    SELECT u.id AS user_id, u.email, up.policy_name AS assigned_name
    FROM users u
    LEFT JOIN user_policies up ON up.user_id = u.id
    WHERE EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id)
       OR EXISTS (SELECT 1 FROM device_tokens t WHERE t.user_id = u.id)
    ORDER BY u.email
  `) as PersonPack[];
}

export async function resolvePack(userId?: number | null): Promise<ResolvedPack> {
  const db = sql();
  if (userId) {
    const assigned = (await db`
      SELECT ps.name, p.bundle_ver, p.cedar_text AS cedar
      FROM user_policies up
      JOIN policy_sets ps ON ps.name = up.policy_name
      JOIN policies p ON p.bundle_ver = ps.bundle_ver
      WHERE up.user_id = ${userId}
      LIMIT 1
    `) as { name: string; bundle_ver: string; cedar: string }[];
    if (assigned[0]) {
      return { ...assigned[0], assigned: true };
    }
  }
  const named = (await db`
    SELECT ps.name, p.bundle_ver, p.cedar_text AS cedar
    FROM policy_sets ps
    JOIN policies p ON p.bundle_ver = ps.bundle_ver
    WHERE ps.is_default
    LIMIT 1
  `) as { name: string; bundle_ver: string; cedar: string }[];
  if (named[0]) {
    return { ...named[0], assigned: false };
  }
  const legacy = (await db`
    SELECT bundle_ver, cedar_text AS cedar
    FROM policies
    WHERE is_current
    ORDER BY created_at DESC
    LIMIT 1
  `) as { bundle_ver: string; cedar: string }[];
  if (legacy[0]) {
    return { name: null, bundle_ver: legacy[0].bundle_ver, cedar: legacy[0].cedar, assigned: false };
  }
  return { name: null, bundle_ver: null, cedar: null, assigned: false };
}

export async function setDefaultSet(name: string): Promise<PolicySetRow> {
  const db = sql();
  const rows = (await db`
    SELECT name, bundle_ver FROM policy_sets WHERE name = ${name} LIMIT 1
  `) as { name: string; bundle_ver: string }[];
  if (!rows[0]) {
    throw new PolicySetError(404, { error: "unknown policy name" });
  }
  const ver = rows[0].bundle_ver;
  await db.transaction((txn) => [
    txn`UPDATE policy_sets SET is_default = false WHERE is_default`,
    txn`UPDATE policy_sets SET is_default = true, updated_at = now() WHERE name = ${name}`,
    txn`UPDATE policies SET is_current = false WHERE is_current`,
    txn`UPDATE policies SET is_current = true WHERE bundle_ver = ${ver}`,
  ]);
  const out = (await db`
    SELECT name, bundle_ver, is_default, updated_at
    FROM policy_sets WHERE name = ${name} LIMIT 1
  `) as PolicySetRow[];
  return out[0];
}

export async function assignUserPack(
  userId: number,
  policyName: string | null,
  assignedBy: string,
): Promise<PersonPack> {
  const db = sql();
  const users = (await db`
    SELECT id, email FROM users WHERE id = ${userId} LIMIT 1
  `) as { id: number; email: string }[];
  if (!users[0]) {
    throw new PolicySetError(404, { error: "unknown user" });
  }
  if (policyName === null) {
    await db`DELETE FROM user_policies WHERE user_id = ${userId}`;
    return { user_id: users[0].id, email: users[0].email, assigned_name: null };
  }
  const name = normalizePolicyName(policyName);
  if (!name) {
    throw new PolicySetError(400, { error: "invalid policy name" });
  }
  const sets = (await db`
    SELECT name FROM policy_sets WHERE name = ${name} LIMIT 1
  `) as { name: string }[];
  if (!sets[0]) {
    throw new PolicySetError(404, { error: "unknown policy name" });
  }
  await db`
    INSERT INTO user_policies (user_id, policy_name, assigned_by, assigned_at)
    VALUES (${userId}, ${name}, ${assignedBy}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      policy_name = EXCLUDED.policy_name,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = now()
  `;
  return { user_id: users[0].id, email: users[0].email, assigned_name: name };
}

export class PolicySetError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "policy set error"));
  }
}
