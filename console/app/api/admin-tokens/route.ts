import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";
import { hashToken, newAdminToken } from "@/lib/token";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const token = newAdminToken();
  const db = sql();
  await db`
    INSERT INTO admin_tokens (user_id, token_hash)
    VALUES (${session.user.id}, ${hashToken(token)})
  `;
  return Response.json({ token });
}
