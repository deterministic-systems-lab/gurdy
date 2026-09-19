import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { hashToken, newDeviceToken } from "@/lib/token";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = newDeviceToken();
  const db = sql();
  await db`
    INSERT INTO device_tokens (user_id, token_hash)
    VALUES (${session.user.id}, ${hashToken(token)})
  `;
  return Response.json({ token });
}
