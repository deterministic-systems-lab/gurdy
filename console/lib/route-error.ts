import { randomUUID } from "node:crypto";

/**
 * An unhandled throw in a route handler becomes a 500 with an empty body, so
 * the shipper prints `failed (500):` and then nothing at all. A pending
 * migration looked identical to an outage. The cause stays in the server log;
 * the caller gets a ref to quote.
 */
export function logRef(scope: string, err: unknown): string {
  const ref = randomUUID().slice(0, 8);
  console.error(`[${scope} ${ref}]`, err);
  return ref;
}

export function serverError(scope: string, err: unknown): Response {
  return Response.json(
    { error: "internal_error", ref: logRef(scope, err) },
    { status: 500 },
  );
}
