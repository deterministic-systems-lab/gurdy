import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readKeys } from "./read-keys.mjs";

const root = path.join(import.meta.dirname, "..", "..");
const web = path.join(import.meta.dirname, "..");
const keys = readKeys(path.join(root, ".keys"));
if (!keys.vercel) {
  throw new Error("/.keys is missing a vercel CLI token");
}

const envPath = path.join(web, ".env.local");
if (!existsSync(envPath)) {
  throw new Error("web/.env.local missing — run setup-neon first");
}
const local = parseEnv(readFileSync(envPath, "utf8"));
for (const name of ["DATABASE_URL", "AUTH_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_EMAILS"]) {
  if (!local[name]) {
    throw new Error(`web/.env.local missing ${name}`);
  }
}

const headers = {
  Authorization: `Bearer ${keys.vercel}`,
  "Content-Type": "application/json",
};

const listed = await vercel("/v9/projects?limit=20");
let project = (listed.projects ?? []).find((p) => p.name === "gurdy");
if (!project) {
  project = await vercel("/v10/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "gurdy",
      framework: "nextjs",
    }),
  });
  console.log("created vercel project", project.id);
} else {
  console.log("reusing vercel project", project.id);
}
project = await vercel(`/v9/projects/${project.id}`);

const existingEnv = await vercel(`/v9/projects/${project.id}/env`);
const have = new Set((existingEnv.envs ?? []).map((e) => e.key));
const AUTH_URL = local.AUTH_URL || "${GURDY_DASHBOARD_URL}";
const runtime = {
  DATABASE_URL: local.DATABASE_URL,
  AUTH_SECRET: local.AUTH_SECRET,
  AUTH_URL,
  RESEND_API_KEY: local.RESEND_API_KEY,
  EMAIL_FROM: local.EMAIL_FROM,
  ADMIN_EMAILS: local.ADMIN_EMAILS,
};
for (const [key, value] of Object.entries(runtime)) {
  if (have.has(key)) {
    console.log("env exists", key);
    continue;
  }
  await vercel(`/v10/projects/${project.id}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });
  console.log("set env", key);
}

let linked = Boolean(project.link);
if (!linked) {
  try {
    await vercel(`/v9/projects/${project.id}/link`, {
      method: "POST",
      body: JSON.stringify({
        type: "github",
        org: "deterministic-systems-lab",
        repo: "gurdy",
      }),
    });
    linked = true;
    console.log("linked github deterministic-systems-lab/gurdy");
  } catch (err) {
    console.log("github link skipped:", err instanceof Error ? err.message.slice(0, 200) : err);
  }
}

// Git clones the repo; CLI uploads cwd. rootDirectory=console is only valid
// once GitHub is linked. Setting it earlier makes `vercel --prod` from
// console/ look for console/console and fail.
if (linked && project.rootDirectory !== "console") {
  await vercel(`/v9/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ rootDirectory: "console", framework: "nextjs" }),
  });
  console.log("set rootDirectory console");
} else if (!linked && project.rootDirectory) {
  await vercel(`/v9/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ rootDirectory: null }),
  });
  console.log("cleared rootDirectory until github is linked");
}

console.log("project", project.name, project.id);

async function vercel(pathname, init = {}) {
  const res = await fetch(`https://api.vercel.com${pathname}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`vercel ${pathname} ${res.status}: ${text.slice(0, 400)}`);
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
