import { ingest, IngestError, listOffsets, type IngestBody } from "@/lib/ingest";
import { logRef, serverError } from "@/lib/route-error";
import { bearerToken } from "@/lib/token";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "missing bearer token" }, { status: 401 });
  }
  try {
    const partitions = await listOffsets(token);
    return Response.json({ partitions });
  } catch (err) {
    return ingestError(err);
  }
}

export async function POST(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "missing bearer token" }, { status: 401 });
  }
  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.partition || body.offset == null || !body.kid || body.bytes == null) {
    return Response.json(
      { error: "partition, offset, kid, and bytes are required" },
      { status: 400 },
    );
  }
  try {
    const result = await ingest(token, {
      partition: body.partition,
      offset: Number(body.offset),
      kid: body.kid,
      bytes: body.bytes,
    });
    return Response.json(result);
  } catch (err) {
    return ingestError(err);
  }
}

function ingestError(err: unknown): Response {
  if (err instanceof IngestError) {
    return Response.json(err.body, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  // A verify that ran out of time is the one case worth naming: it is not a
  // broken chain, it is a chain that got too big to re-check inside the
  // request, and the caller should not retry it the same way.
  if (/timed out/i.test(message)) {
    const ref = logRef("ingest", err);
    return Response.json({ error: "verify_timeout", ref, detail: message }, { status: 504 });
  }
  return serverError("ingest", err);
}
