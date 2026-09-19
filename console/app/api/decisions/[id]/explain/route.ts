import { generateText } from "ai";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { decisionById, decisionForUser, type DecisionRow } from "@/lib/queries";
import { claim, outcome, seenAs } from "@/lib/outcome";

/** Two sentences does not need a large model. Overridable without a deploy. */
const MODEL = process.env.EXPLAIN_MODEL || "anthropic/claude-haiku-4.5";

/* The answer is two sentences. Cap it so a runaway model cannot bill for an
   essay nobody asked for. */
const MAX_TOKENS = 160;

const SYSTEM = `You explain a single record from a security audit log to the engineer whose own machine produced it.

Rules:
- Two sentences. Forty words at most. Plain English, no preamble, no bullet points.
- Use only the fields you are given. Never invent a path, a tool, a rule name, or a motive.
- Three fields mean different things and must not be merged: "decision" is what the
  policy concluded, "policy_mode" is how that policy was rolled out, and
  "action_applied" is what actually happened to the call. A blocked decision that was
  forwarded anyway did run.
- The deterministic reading given to you is already correct. Never contradict it.
- The record says what happened, not why. If the reason is not in the fields, say the
  record does not give one.
- "identity not attested" means the proxy could not confirm who made the call. It does
  not mean the caller was unauthenticated, untrusted, or an intruder. Same for a claim
  that did not check out: the claim failed a check, the caller is not therefore hostile.
- Do not explain why a rollout mode exists or what it is for. Say only what it did here.
- Do not judge whether the call was dangerous and do not recommend a fix.`;

/** Only the fields, flattened. Anything absent is stated as absent. */
function facts(row: DecisionRow): string {
  const resource = row.resource_attrs
    ? Object.entries(row.resource_attrs)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  const lines = [
    `tool or action: ${row.tool ?? row.action ?? "not recorded"}`,
    `resource: ${resource || "not recorded"}`,
    `decision: ${row.decision ?? "not recorded"}`,
    `policy_mode: ${row.policy_mode ?? "not recorded"}`,
    `action_applied: ${row.action_applied ?? "not recorded"}`,
    `deterministic reading: ${outcome(row)}`,
    `caller: ${row.principal ?? "not recorded"} (${seenAs(row.principal_tier)})`,
    `agent claim: ${claim(row)}`,
    `policy pack: ${row.bundle_ver ?? "not recorded"}`,
    `chain: ${row.partition} at seq ${row.seq}`,
  ];
  return lines.join("\n");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let row = await decisionForUser(session.user.id, id);
  if (!row && isAdmin(session.user.email)) {
    row = await decisionById(id);
  }
  if (!row) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: "No AI Gateway credential. Set AI_GATEWAY_API_KEY." },
      { status: 503 },
    );
  }
  try {
    const { text } = await generateText({
      model: MODEL,
      system: SYSTEM,
      prompt: facts(row),
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.2,
    });
    const said = text.trim();
    if (!said) {
      return Response.json(
        { error: "the model returned nothing" },
        { status: 502 },
      );
    }
    return Response.json({ text: said });
  } catch (err) {
    // The gateway error can carry account detail, so it stays in the log.
    console.error("explain failed", err);
    return Response.json(
      { error: "could not reach the model" },
      { status: 502 },
    );
  }
}
