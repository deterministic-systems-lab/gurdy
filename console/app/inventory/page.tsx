import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { Shell } from "@/app/shell";
import { DecisionRows, PairCount } from "@/app/ui/fields";
import { estateInventory, type EstateInventory } from "@/lib/queries";
import type { InventoryCount } from "@/lib/inventory";

function CountList({
  rows,
  empty,
}: {
  rows: (InventoryCount & { extra?: string })[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[var(--muted)]">{empty}</p>;
  }
  return (
    <div className="card overflow-hidden">
      <ul className="row-list">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-4 text-sm"
          >
            <span className="min-w-0">
              <span className="mono font-extrabold">{row.key}</span>
              {row.extra ? (
                <span className="text-[var(--muted)]"> · {row.extra}</span>
              ) : null}
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              {row.calls} call{row.calls === 1 ? "" : "s"} · {row.violations}{" "}
              violation{row.violations === 1 ? "" : "s"} · {row.stopped} stopped
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return (
      <Shell email={session?.user?.email} admin={false}>
        <p>Only an address in ADMIN_EMAILS can open Inventory.</p>
      </Shell>
    );
  }

  const inventory: EstateInventory = await estateInventory();

  return (
    <Shell email={session.user.email} admin>
      <h1 className="display mb-2 text-4xl text-[var(--indigo)]">Inventory</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--muted)]">
        Every decided call that a verified push accepted, across the estate.
        Traffic that never reached gurdy-proxy is not here. This is not a
        coverage claim. Path and host are attributes the pack evaluated;
        request bodies are not stored.
      </p>

      <PairCount
        violations={inventory.totals.violations}
        stopped={inventory.totals.stopped}
      />
      <p className="mt-3 mb-10 text-sm text-[var(--muted)]">
        {inventory.totals.calls} decided call
        {inventory.totals.calls === 1 ? "" : "s"} in total.{" "}
        <span className="mono">allow-all-monitor</span> is the permit under
        the forbids, not a finding.
      </p>

      <section className="mb-10 space-y-3">
        <h2 className="display text-2xl">Tools</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Cedar <span className="mono">context.tool</span> after classify
          (Read becomes <span className="mono">read_file</span>,{" "}
          <span className="mono">curl</span> becomes{" "}
          <span className="mono">http_fetch</span>).
        </p>
        <CountList rows={inventory.tools} empty="No decided calls yet." />
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="display text-2xl">Services</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          One partition is one ledger dir. Native Cursor is{" "}
          <span className="mono">cursor/</span>. Named MCP wraps keep the
          server name.
        </p>
        <CountList
          rows={inventory.services.map((row) => ({ ...row, extra: row.surface }))}
          empty="No partitions have decisions yet."
        />
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="display text-2xl">Rules</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Determining <span className="mono">policy_id</span> values. A call
          that fires two policies is counted on both rows.
        </p>
        <CountList rows={inventory.rules} empty="No policy_effects recorded yet." />
      </section>

      <section className="space-y-3">
        <h2 className="display text-2xl">Recent forbids</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Last 80 <span className="mono">decision=block</span> rows. Surface,
          determining rule, and path or host sit under each verdict.
        </p>
        {inventory.recentBlocks.length === 0 ? (
          <p className="text-[var(--muted)]">
            No <span className="mono">decision=block</span> records on the
            estate. This does not prove that nothing happened.
          </p>
        ) : (
          <DecisionRows rows={inventory.recentBlocks} linkPartition explain />
        )}
      </section>
    </Shell>
  );
}
