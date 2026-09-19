import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { chainForUser } from "@/lib/queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const chain = await chainForUser(session.user.id, id);
  if (!chain) {
    return new Response("not found", { status: 404 });
  }
  const db = sql();
  const lines = (await db`
    SELECT raw FROM ledger_lines
    WHERE chain_id = ${id}
    ORDER BY seq
  `) as { raw: string }[];
  const body = lines.map((l) => l.raw).join("");
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${chain.partition}"`,
    },
  });
}
