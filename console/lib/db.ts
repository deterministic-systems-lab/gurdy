import { neon, Pool } from "@neondatabase/serverless";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

/** HTTP tagged-template client. Create per request; do not share across isolates. */
export function sql() {
  return neon(databaseUrl());
}

/** Auth.js adapter pool. Create inside the NextAuth factory, not at module scope. */
export function authPool(): Pool {
  return new Pool({ connectionString: databaseUrl() });
}
