import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readKeys } from "./read-keys.mjs";

const root = path.join(import.meta.dirname, "..", "..");
const web = path.join(import.meta.dirname, "..");
const keys = readKeys(path.join(root, ".keys"));
if (!keys.neon) {
  throw new Error("/.keys is missing a neon API key");
}

const api = "https://console.neon.tech/api/v2";
const headers = {
  Accept: "application/json",
  Authorization: `Bearer ${keys.neon}`,
  "Content-Type": "application/json",
};

const listed = await neonFetch("/projects");
const existing = (listed.projects ?? []).find((p) => p.name === "gurdy");
let project = existing;
let connectionUri;

if (!existing) {
  const created = await neonFetch("/projects", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: "gurdy",
        region_id: "aws-us-east-1",
        pg_version: 17,
      },
    }),
  });
  project = created.project;
  connectionUri = created.connection_uris?.[0]?.connection_uri;
  console.log("created neon project", project.id);
} else {
  console.log("reusing neon project", project.id);
}

if (!connectionUri) {
  const uri = await neonFetch(
    `/projects/${project.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
  );
  connectionUri = uri.uri;
}

const envPath = path.join(web, ".env.local");
const current = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const next = {
  DATABASE_URL: connectionUri,
  AUTH_SECRET: current.AUTH_SECRET || randomBytes(32).toString("base64"),
  RESEND_API_KEY: keys.resend ?? current.RESEND_API_KEY ?? "",
  EMAIL_FROM: current.EMAIL_FROM || "Gurdy <noreply@your-verified-domain.example>",
  ADMIN_EMAILS:
    current.ADMIN_EMAILS ||
    process.env.ADMIN_EMAILS || "",
  NEON_PROJECT_ID: project.id,
};
writeFileSync(envPath, serializeEnv(next));
console.log("wrote web/.env.local (DATABASE_URL + AUTH_SECRET, not printed)");

async function neonFetch(pathname, init = {}) {
  const res = await fetch(`${api}${pathname}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`neon ${pathname} ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const i = line.indexOf("=");
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function serializeEnv(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
}
