import { FleetError, loadDeviceToken, recordHeartbeat, type HeartbeatBody } from "@/lib/fleet";
import { serverError } from "@/lib/route-error";
import { bearerToken } from "@/lib/token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "missing bearer token" }, { status: 401 });
  }
  let body: HeartbeatBody;
  try {
    body = (await request.json()) as HeartbeatBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const row = await loadDeviceToken(token);
    if (!row) {
      return Response.json({ error: "invalid device token" }, { status: 401 });
    }
    return Response.json(await recordHeartbeat(row, body));
  } catch (err) {
    if (err instanceof FleetError) {
      return Response.json(err.body, { status: err.status });
    }
    return serverError("fleet/heartbeat", err);
  }
}
