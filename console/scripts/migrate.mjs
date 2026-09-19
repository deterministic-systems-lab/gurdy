import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(url);
const dir = path.join(import.meta.dirname, "..", "db", "migrations");

await sql.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const done = await sql`SELECT 1 FROM schema_migrations WHERE id = ${file}`;
  if (done.length) {
    console.log("skip", file);
    continue;
  }
  const text = await readFile(path.join(dir, file), "utf8");
  for (const stmt of splitStatements(text)) {
    await sql.query(stmt);
  }
  await sql`INSERT INTO schema_migrations (id) VALUES (${file})`;
  console.log("applied", file);
}

function splitStatements(sqlText) {
  const withoutComments = sqlText
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
