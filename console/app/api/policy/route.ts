import { adminActor, isAdmin } from "@/lib/admin";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { bundleVer, compileCheck } from "@/lib/policy";
import { normalizePolicyName } from "@/lib/policy-name";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const db = sql();
  const rows = await db`
    SELECT
      p.bundle_ver, p.name, p.uploaded_by, p.note, p.is_current, p.created_at,
      (s.name IS NOT NULL) AS in_catalog,
      COALESCE(s.is_default, false) AS is_default,
      (SELECT count(*)::int FROM decisions d WHERE d.bundle_ver = p.bundle_ver) AS decisions,
      (SELECT count(DISTINCT c.device_id)::int
         FROM decisions d
         JOIN chains c ON c.id = d.chain_id
        WHERE d.bundle_ver = p.bundle_ver) AS devices
    FROM policies p
    LEFT JOIN policy_sets s ON s.bundle_ver = p.bundle_ver AND s.name = p.name
    ORDER BY p.created_at DESC
  `;
  return Response.json({ policies: rows });
}

export async function POST(request: Request) {
  const actor = await adminActor(request);
  if (!actor) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    cedar?: string;
    note?: string;
    name?: string;
    make_default?: boolean;
  };
  const cedar = body.cedar ?? "";
  if (!cedar.trim()) {
    return Response.json({ error: "cedar text is required" }, { status: 400 });
  }
  const name = normalizePolicyName(body.name);
  if (!name) {
    return Response.json(
      { error: "name is required (letters, numbers, space, . _ / -)" },
      { status: 400 },
    );
  }
  const check = await compileCheck(cedar);
  if (!check.ok) {
    return Response.json({ error: "compile_failed", detail: check.error }, { status: 400 });
  }
  const ver = bundleVer(cedar);
  const db = sql();
  const existingDefault = (await db`
    SELECT name FROM policy_sets WHERE is_default LIMIT 1
  `) as { name: string }[];
  const asDefault = Boolean(body.make_default) || existingDefault.length === 0;

  await db.transaction((txn) => {
    const stmts = [
      txn`
        INSERT INTO policies (bundle_ver, cedar_text, uploaded_by, note, is_current, name)
        VALUES (${ver}, ${cedar}, ${actor.email}, ${body.note ?? null}, ${asDefault}, ${name})
        ON CONFLICT (bundle_ver) DO UPDATE SET
          is_current = (EXCLUDED.is_current OR policies.is_current),
          note = COALESCE(EXCLUDED.note, policies.note),
          uploaded_by = EXCLUDED.uploaded_by,
          name = EXCLUDED.name
      `,
    ];
    if (asDefault) {
      stmts.unshift(
        txn`UPDATE policy_sets SET is_default = false WHERE is_default`,
        txn`UPDATE policies SET is_current = false WHERE is_current`,
      );
    }
    stmts.push(txn`
      INSERT INTO policy_sets (name, bundle_ver, is_default, updated_at)
      VALUES (${name}, ${ver}, ${asDefault}, now())
      ON CONFLICT (name) DO UPDATE SET
        bundle_ver = EXCLUDED.bundle_ver,
        updated_at = now(),
        is_default = (policy_sets.is_default OR EXCLUDED.is_default)
    `);
    return stmts;
  });

  return Response.json({ ok: true, bundle_ver: ver, name, is_default: asDefault });
}
