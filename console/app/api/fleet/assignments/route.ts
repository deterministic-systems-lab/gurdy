import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { PolicySetError, assignUserPack } from "@/lib/policy-sets";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { user_id?: unknown; policy_name?: unknown };
  try {
    body = (await request.json()) as { user_id?: unknown; policy_name?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const userId = Number(body.user_id);
  if (!Number.isInteger(userId) || userId < 1) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }
  if (body.policy_name !== null && typeof body.policy_name !== "string") {
    return Response.json({ error: "policy_name must be a string or null" }, { status: 400 });
  }
  try {
    const row = await assignUserPack(
      userId,
      body.policy_name === null ? null : body.policy_name,
      session.user.email,
    );
    return Response.json({ ok: true, ...row });
  } catch (err) {
    if (err instanceof PolicySetError) {
      return Response.json(err.body, { status: err.status });
    }
    throw err;
  }
}
