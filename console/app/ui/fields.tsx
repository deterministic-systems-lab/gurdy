import Link from "next/link";
import type { ChainSummary, DecisionRow } from "@/lib/queries";
import { accessFactsText } from "@/lib/inventory";
import { identityNote, outcome, outcomeKind, outcomeMark } from "@/lib/outcome";
import { Chip, StatRow } from "@/app/ui/pop";
import { ExplainButton } from "@/app/ui/explain";
import { formatCount } from "@/lib/format";

/** One call per row: the verdict in a fixed left column so the page can be
 *  scanned down it, then what happened, then the fields it is read from. */
export function DecisionRows({
  rows,
  linkPartition = false,
  explain = false,
}: {
  rows: DecisionRow[];
  linkPartition?: boolean;
  /** Offer a plain-English reading per row. Costs a model call on click. */
  explain?: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <ul className="row-list">
        {rows.map((row) => {
          const notes = identityNote(row);
          const owner = "email" in row ? (row as { email?: string | null }).email : null;
          const mark = outcomeMark(row);
          const kind = outcomeKind(row);
          const rowTone =
            kind === "stopped" || kind === "failed-closed" || kind === "rewritten"
              ? "row-stopped"
              : kind === "shadow"
                ? "row-shadow"
                : "";
          return (
            <li key={row.id} className={`px-6 py-3 ${rowTone}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <Chip
                  tone={mark.tone}
                  className="w-[8.5rem] shrink-0 justify-center text-xs font-extrabold tracking-wide uppercase"
                >
                  {mark.label}
                </Chip>
                <span
                  className={`mono w-14 shrink-0 text-sm font-extrabold ${
                    row.decision === "block"
                      ? "text-[var(--coral-ink)]"
                      : "text-[var(--indigo)]"
                  }`}
                >
                  {row.decision ?? "—"}
                </span>
                <span className="mono shrink-0 text-sm font-extrabold">
                  {linkPartition ? (
                    <>
                      <Link href={`/chains/${row.chain_id}`}>
                        {row.partition}
                      </Link>
                      :
                    </>
                  ) : (
                    "seq "
                  )}
                  {String(row.seq)} · {row.tool ?? row.action ?? "call"}
                </span>
                <span className="min-w-0 flex-1 text-sm">{outcome(row)}</span>
              </div>
              <p className="mono mt-0.5 text-xs text-[var(--muted)] sm:pl-[9.75rem]">
                action_applied={row.action_applied ?? "—"} · policy_mode=
                {row.policy_mode ?? "—"} · {row.principal ?? "—"}
                {notes.length ? ` · ${notes.join(" · ")}` : ""}
                {owner ? ` · ${owner}` : ""}
              </p>
              <p className="mono mt-0.5 text-xs break-all text-[var(--muted)] sm:pl-[9.75rem]">
                {accessFactsText(row)}
              </p>
              {explain ? <ExplainButton id={row.id} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PairCount({
  violations,
  stopped,
}: {
  violations: number;
  stopped: number;
}) {
  return (
    <div className="space-y-3">
      <StatRow
        items={[
          {
            label: "violations",
            value: formatCount(violations),
            tone: "coral",
          },
          { label: "stopped", value: formatCount(stopped) },
        ]}
      />
      {stopped === 0 && violations > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Shadow mode records a violation but stops nothing, so a zero here is
          correct.
        </p>
      ) : null}
    </div>
  );
}

export function CoverageChips({ chain }: { chain: ChainSummary }) {
  const chips: { label: string; tone: "finding" | "coral" }[] = [];
  // Wording follows spec §7: these bound what the proxy saw and then lost,
  // never what it never saw. Each count is a signed lower bound.
  if (Number(chain.dropped)) {
    chips.push({
      label: `${chain.dropped} lost to a full queue`,
      tone: "finding",
    });
  }
  if (Number(chain.write_errors)) {
    chips.push({
      label: `${chain.write_errors} failed to write`,
      tone: "finding",
    });
  }
  if (Number(chain.identity_failed)) {
    chips.push({
      label: `${chain.identity_failed} with no identity`,
      tone: "finding",
    });
  }
  if (Number(chain.liveness_gaps)) {
    const n = Number(chain.liveness_gaps);
    chips.push({
      label: `${n} ${n === 1 ? "gap" : "gaps"} with no evidence`,
      tone: "finding",
    });
  }
  if (Number(chain.unclean_restarts)) {
    const n = Number(chain.unclean_restarts);
    chips.push({
      label: `${n} ${n === 1 ? "restart" : "restarts"} after a crash`,
      tone: "coral",
    });
  }
  if (chain.clean_end === false) {
    chips.push({ label: "ended without saying so", tone: "coral" });
  }
  if (!chips.length) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((c) => (
        <Chip key={c.label} tone={c.tone}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
}
