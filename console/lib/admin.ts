import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { bearerToken, hashToken } from "@/lib/token";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return adminEmails().includes(email.toLowerCase());
}

export type AdminTokenRow = {
  id: string;
  user_id: number;
  email: string;
};

export async function loadAdminToken(bearer: string): Promise<AdminTokenRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT t.id, t.user_id, u.email
    FROM admin_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hashToken(bearer)}
      AND t.revoked_at IS NULL
    LIMIT 1
  `) as AdminTokenRow[];
  return rows[0] ?? null;
}

/** Session cookie or gra_ bearer. Device tokens are not accepted. */
export async function adminActor(
  request: Request,
): Promise<{ email: string } | null> {
  const session = await auth();
  if (session?.user?.email && isAdmin(session.user.email)) {
    return { email: session.user.email };
  }
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return null;
  }
  const row = await loadAdminToken(token);
  if (!row || !isAdmin(row.email)) {
    return null;
  }
  const db = sql();
  await db`UPDATE admin_tokens SET last_used_at = now() WHERE id = ${row.id}`;
  return { email: row.email };
}
