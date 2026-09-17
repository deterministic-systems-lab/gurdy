/** Shape of a decided call for the estate inventory. No request bodies. */

export type AccessSurface = "native" | "wrap";

export type PolicyEffect = {
  policy_id?: string;
  decision?: string;
  mode?: string;
  enforce_action?: string;
  on_error?: string;
};

export type InventoryCount = {
  key: string;
  calls: number;
  violations: number;
  stopped: number;
};

export type ResourceHint = { kind: "path" | "host"; value: string };

const SKIP_ATTRS = new Set(["tool_declared", "tool_signature", "tool_endpoint"]);

export function asAttrMap(raw: unknown): Record<string, string> | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() && !SKIP_ATTRS.has(k)) {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Path or host the pack saw. Query strings are dropped; bodies were never stored. */
export function resourceHint(attrs: unknown): ResourceHint | null {
  const map = asAttrMap(attrs);
  if (!map) {
    return null;
  }
  const path = map.resource_path?.trim();
  if (path) {
    return { kind: "path", value: path };
  }
  const host = map.resource_host?.trim();
  if (host) {
    return { kind: "host", value: host };
  }
  const url = map.url?.trim() || map.uri?.trim() || map.endpoint?.trim();
  if (url) {
    return hintFromUrl(url);
  }
  return null;
}

function hintFromUrl(raw: string): ResourceHint {
  try {
    const u = new URL(raw);
    const path = u.pathname === "/" ? "" : u.pathname;
    return { kind: "host", value: `${u.host}${path}` };
  } catch {
    const cut = raw.split("?")[0]?.split("#")[0] ?? raw;
    return { kind: "host", value: cut };
  }
}

export function policyEffects(raw: unknown): PolicyEffect[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const out: PolicyEffect[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as PolicyEffect);
    }
  }
  return out;
}

export function ruleIds(raw: unknown, decision?: string): string[] {
  const ids: string[] = [];
  for (const effect of policyEffects(raw)) {
    const id = effect.policy_id?.trim();
    if (!id) {
      continue;
    }
    if (decision && effect.decision !== decision) {
      continue;
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/** Forbids first on a block row; otherwise every determining policy_id. */
export function displayRules(raw: unknown, decision: string | null): string[] {
  if (decision === "block") {
    const forbid = ruleIds(raw, "block");
    if (forbid.length) {
      return forbid;
    }
  }
  return ruleIds(raw);
}

/**
 * Native Cursor ledgers live under cursor/. Wrap ledgers are named MCP
 * servers (filesystem/, arbital_stdio_cat-, …). A unique `_proxy-*.jsonl`
 * with no directory prefix is the cursor chain from before two servers
 * shared that filename. Principal is not a discriminator: both transports
 * run gurdy-proxy -stdio.
 */
export function accessSurface(partition: string): AccessSurface {
  const part = partition.split("\\").join("/");
  if (part === "cursor" || part.startsWith("cursor/") || part.startsWith("cursor.")) {
    return "native";
  }
  if (part.startsWith("_proxy-") || part.startsWith("_proxy.")) {
    return "native";
  }
  return "wrap";
}

export function accessFactsText(row: {
  partition: string;
  policy_effects: unknown;
  decision: string | null;
  resource_attrs: unknown;
}): string {
  const surface = accessSurface(row.partition);
  const rules = displayRules(row.policy_effects, row.decision);
  const hint = resourceHint(row.resource_attrs);
  const parts = [surface, rules.length ? rules.join(", ") : "no policy_id"];
  if (hint) {
    parts.push(`${hint.kind} ${hint.value}`);
  }
  return parts.join(" · ");
}

export function asCountRow(row: {
  key?: unknown;
  calls?: unknown;
  violations?: unknown;
  stopped?: unknown;
}): InventoryCount {
  const key = String(row.key ?? "").trim() || "(none)";
  return {
    key,
    calls: Number(row.calls) || 0,
    violations: Number(row.violations) || 0,
    stopped: Number(row.stopped) || 0,
  };
}
