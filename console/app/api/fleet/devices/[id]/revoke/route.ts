import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { revokeDevice } from "@/lib/fleet";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }
  const result = await revokeDevice(id);
  if ("error" in result) {
    return Response.json(result, { status: 404 });
  }
  return Response.json(result);
}
