import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";
import { summarizeCedar } from "@/lib/pack";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ver: string }> },
) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const ver = decodeURIComponent((await context.params).ver);
  const db = sql();
  const rows = (await db`
    SELECT
      p.bundle_ver, p.name, p.cedar_text, p.uploaded_by, p.note, p.created_at,
      COALESCE(s.is_default, false) AS is_default
    FROM policies p
    LEFT JOIN policy_sets s ON s.bundle_ver = p.bundle_ver AND s.name = p.name
    WHERE p.bundle_ver = ${ver}
    LIMIT 1
  `) as {
    bundle_ver: string;
    name: string | null;
    cedar_text: string;
    uploaded_by: string;
    note: string | null;
    created_at: Date;
    is_default: boolean;
  }[];
  const row = rows[0];
  if (!row) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({
    bundle_ver: row.bundle_ver,
    name: row.name,
    cedar: row.cedar_text,
    uploaded_by: row.uploaded_by,
    note: row.note,
    created_at: row.created_at,
    is_default: row.is_default,
    summary: summarizeCedar(row.cedar_text),
  });
}
