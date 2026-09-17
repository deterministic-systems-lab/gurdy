import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { listFleet } from "@/lib/fleet";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await listFleet();
  return Response.json(body);
}
