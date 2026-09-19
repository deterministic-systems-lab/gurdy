import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { CoverageChips, DecisionRows, PairCount } from "@/app/ui/fields";
import { CallFilter } from "@/app/ui/call-filter";
import { asShown, SHOWN_LABEL, type Shown } from "@/lib/call-filter";
import { Chip } from "@/app/ui/pop";
import { Shell } from "@/app/shell";
import { chainForUser, counts, decisionsForUser } from "@/lib/queries";
import { formatCount } from "@/lib/format";

/** A number, what it is called, and what it means in one sentence. */
function CountRow({
  term,
  value,
  say,
}: {
  term: string;
  value: number | null;
  say: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3">
      <dt className="w-44 shrink-0 text-sm font-extrabold">{term}</dt>
      <dd className="stat-num min-w-12 shrink-0 text-2xl font-extrabold tabular-nums text-[var(--indigo)]">
        {value === null ? "—" : formatCount(value)}
      </dd>
      <dd className="min-w-0 flex-1 text-sm text-[var(--muted)]">{say}</dd>
    </li>
  );
}

export default async function ChainPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  const { id } = await params;
  const shown = asShown((await searchParams).show);

  const chain = await chainForUser(session.user.id, id);
  if (!chain) {
    notFound();
  }
  const rows = await decisionsForUser(session.user.id, { chainId: id });
  const { violations, stopped } = counts(rows);
  const unanswered = (chain.decisions_count ?? 0) - (chain.answered ?? 0);
  const tally: Record<Shown, number> = {
    all: rows.length,
    allow: rows.filter((r) => r.decision === "allow").length,
    block: rows.filter((r) => r.decision === "block").length,
  };
  const visible =
    shown === "all" ? rows : rows.filter((r) => r.decision === shown);

  return (
    <Shell email={session.user.email} admin={isAdmin(session.user.email)}>
      <p className="mono text-xs text-[var(--muted)]">
        <Link href="/">chains</Link> / {chain.partition}
      </p>
      <h1 className="display mt-2 text-4xl text-[var(--indigo)]">
        {chain.partition}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        One signed run of records from a device registered to you. Each record
        points at the one before it, so a missing line shows up.
      </p>
      <p className="mono mt-3 text-xs text-[var(--muted)]">
        kid {chain.kid} · tenant {chain.tenant ?? "—"} · workload{" "}
        {chain.workload ?? "—"} · instance {chain.instance_id ?? "—"} · producer{" "}
        {chain.producer ?? "—"}
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-3">
        <a href={`/api/chains/${chain.id}/export`} className="font-extrabold">
          Download export
        </a>
        <Chip tone="verified">signature checked on arrival</Chip>
      </p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        Gurdy checked the signature when this arrived, but you should not have
        to take its word for it. Run <span className="mono">gurdy-verify</span>{" "}
        on the file yourself.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="display text-2xl">What this chain covers</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          These counts come from the chain itself. A call that never reached the
          proxy is in none of them.
        </p>
        <div className="card overflow-hidden">
          <dl className="row-list">
            <CountRow
              term="calls seen"
              value={chain.decisions_count}
              say="The proxy intercepted this many calls and wrote a decision for each."
            />
            <CountRow
              term="replies matched"
              value={chain.answered}
              say="Each of these calls has the reply that came back stored next to it."
            />
            <CountRow
              term="still waiting"
              value={unanswered}
              say="No reply was stored. It never came back, or the proxy stopped first. It does not mean the call failed."
            />
            <CountRow
              term="replies with no call"
              value={chain.unmatched}
              say="A reply arrived that no recorded call explains. That is a hole in the record."
            />
            <CountRow
              term="records in total"
              value={chain.records}
              say="Every line in the chain, including the start, heartbeat and shutdown markers."
            />
          </dl>
        </div>
        <CoverageChips chain={chain} />
      </section>

      <section id="calls" className="mt-10 scroll-mt-6 space-y-3">
        <h2 className="display text-2xl">Calls</h2>
        <PairCount violations={violations} stopped={stopped} />
        {rows.length === 0 ? (
          <p className="text-[var(--muted)]">
            The proxy recorded no calls in this partition, which is not proof
            that nothing happened.
          </p>
        ) : (
          <>
            <CallFilter id={id} shown={shown} tally={tally} />
            {visible.length === 0 ? (
              <p className="text-[var(--muted)]">
                No call in this partition was {SHOWN_LABEL[shown]}.
              </p>
            ) : (
              <DecisionRows rows={visible} />
            )}
          </>
        )}
      </section>
    </Shell>
  );
}
