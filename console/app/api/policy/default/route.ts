import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { normalizePolicyName } from "@/lib/policy-name";
import { PolicySetError, setDefaultSet } from "@/lib/policy-sets";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const name = normalizePolicyName(body.name);
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const row = await setDefaultSet(name);
    return Response.json({ ok: true, ...row });
  } catch (err) {
    if (err instanceof PolicySetError) {
      return Response.json(err.body, { status: err.status });
    }
    throw err;
  }
}
