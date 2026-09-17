import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { loadDesired, loadDeviceToken, setEnforce } from "@/lib/fleet";
import { serverError } from "@/lib/route-error";
import { bearerToken } from "@/lib/token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const token = bearerToken(request.headers.get("authorization"));
  if (!session?.user?.id && !token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    if (token) {
      const row = await loadDeviceToken(token);
      if (!row) {
        return Response.json({ error: "invalid device token" }, { status: 401 });
      }
      return Response.json(await loadDesired(row.user_id));
    }
    return Response.json(await loadDesired());
  } catch (err) {
    return serverError("fleet/desired", err);
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { enforce?: unknown };
  try {
    body = (await request.json()) as { enforce?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.enforce !== "boolean") {
    return Response.json({ error: "enforce must be a boolean" }, { status: 400 });
  }
  try {
    const desired = await setEnforce(body.enforce, session.user.email);
    return Response.json({
      ok: true,
      bundle_ver: desired.bundle_ver,
      enforce: desired.enforce,
      updated_at: desired.updated_at,
    });
  } catch (err) {
    return serverError("fleet/desired", err);
  }
}
