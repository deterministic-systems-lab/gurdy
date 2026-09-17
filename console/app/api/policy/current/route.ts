import { auth } from "@/auth";
import { loadDeviceToken, loadDesired } from "@/lib/fleet";
import { bearerToken } from "@/lib/token";

export async function GET(request: Request) {
  const session = await auth();
  const token = bearerToken(request.headers.get("authorization"));
  if (!session?.user?.id && !token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let userId: number | null = null;
  if (token) {
    const row = await loadDeviceToken(token);
    if (!row) {
      return Response.json({ error: "invalid device token" }, { status: 401 });
    }
    userId = row.user_id;
  }
  const desired = await loadDesired(userId);
  if (!desired.cedar) {
    return Response.json({ error: "no current policy" }, { status: 404 });
  }
  return Response.json({
    bundle_ver: desired.bundle_ver,
    cedar: desired.cedar,
    policy_name: desired.policy_name,
  });
}
