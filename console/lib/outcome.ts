/** Plain-language readings of a decision record.
 *
 * The three fields stay on screen next to these sentences. They are the
 * evidence; this is only a gloss, and it must never say more than they do.
 * decision is the policy's conclusion, policy_mode is that policy's rollout
 * state when it fired, and action_applied is what the actuator actually did
 * (spec §4.2). "Blocked" and "would have blocked" are the distinction the
 * three fields exist to keep, so the wording keeps it too.
 */

export type Verdict = {
  decision: string | null;
  action_applied: string | null;
  policy_mode: string | null;
};

const SHADOW = new Set(["monitor", "shadow"]);

export type OutcomeKind =
  | "stopped"
  | "rewritten"
  | "failed-open"
  | "failed-closed"
  | "shadow"
  | "leaked"
  | "allowed"
  | "ran"
  | "unknown";

export type OutcomeMark = {
  kind: OutcomeKind;
  label: string;
  tone: "indigo" | "lavender" | "coral" | "finding" | "paper";
};

/** What the actuator did. Used to mark stopped rows apart from shadow ones. */
export function outcomeKind(row: Verdict): OutcomeKind {
  switch (row.action_applied) {
    case "blocked":
      return "stopped";
    case "rewritten":
      return "rewritten";
    case "failed-open":
      return "failed-open";
    case "failed-closed":
      return "failed-closed";
    case "forwarded":
      if (row.decision === "block") {
        return SHADOW.has(row.policy_mode ?? "") ? "shadow" : "leaked";
      }
      if (row.decision === "allow") {
        return "allowed";
      }
      return "ran";
    default:
      return "unknown";
  }
}

export function outcomeMark(row: Verdict): OutcomeMark {
  const kind = outcomeKind(row);
  switch (kind) {
    case "stopped":
    case "failed-closed":
      return { kind, label: "Stopped", tone: "indigo" };
    case "rewritten":
      return { kind, label: "Changed", tone: "indigo" };
    case "shadow":
      return { kind, label: "Shadow", tone: "lavender" };
    case "leaked":
      return { kind, label: "Went through", tone: "coral" };
    case "failed-open":
      return { kind, label: "Let through", tone: "lavender" };
    case "allowed":
      return { kind, label: "Allowed", tone: "finding" };
    case "ran":
      return { kind, label: "Ran", tone: "paper" };
    default:
      return { kind, label: "Unknown", tone: "paper" };
  }
}

export function outcome(row: Verdict): string {
  const shadow = SHADOW.has(row.policy_mode ?? "");

  switch (row.action_applied) {
    case "blocked":
      return "Stopped. It never ran.";
    case "rewritten":
      return "Changed, then allowed to run.";
    case "failed-open":
      return "The policy could not be evaluated. The call was let through.";
    case "failed-closed":
      return "The policy could not be evaluated. The call was stopped.";
    case "forwarded":
      if (row.decision === "block") {
        return shadow
          ? "Would have been stopped. Shadow mode let it through."
          : "The policy said stop, but it went through anyway.";
      }
      if (row.decision === "allow") {
        return "Allowed, and it ran.";
      }
      return "It ran. No verdict was recorded.";
    default:
      return "No record of what happened to this call.";
  }
}

export type Identity = {
  principal: string | null;
  principal_tier: string | null;
  assertion_status: string | null;
  asserted_human_actor: string | null;
};

/** How well the proxy knows who made the call. Observation quality, not trust. */
export function seenAs(tier: string | null): string {
  switch (tier) {
    case "attested":
      return "identity attested";
    case "attested-coarse":
      return "identity attested, coarsely";
    case "orphan":
      return "identity not attested";
    default:
      return "identity unknown";
  }
}

/** Only the parts worth a reader's attention.
 *
 * An attested principal that claimed nothing is the ordinary case and says
 * nothing, so it prints nothing; a weaker identity or any claim at all does.
 * The full set of fields is in the export either way.
 */
export function identityNote(row: Identity): string[] {
  const notes: string[] = [];
  if (row.principal_tier !== "attested") {
    notes.push(seenAs(row.principal_tier));
  }
  if (row.assertion_status && row.assertion_status !== "absent") {
    notes.push(claim(row));
  }
  return notes;
}

/** What the agent claimed about itself. Only valid claims carry a name. */
export function claim(row: Identity): string {
  switch (row.assertion_status) {
    case "valid":
      return row.asserted_human_actor
        ? `the agent named ${row.asserted_human_actor}`
        : "the agent signed a claim, with no person named";
    case "invalid":
      return "the agent made a claim that did not check out";
    case "absent":
      return "the agent claimed nothing";
    default:
      return "no claim recorded";
  }
}
