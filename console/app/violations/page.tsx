import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { DecisionRows, PairCount } from "@/app/ui/fields";
import { Shell } from "@/app/shell";
import { counts, decisionsForUser } from "@/lib/queries";

export default async function ViolationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  const all = await decisionsForUser(session.user.id);
  const rows = all.filter((r) => r.decision === "block");
  const { violations, stopped } = counts(all);

  return (
    <Shell email={session.user.email} admin={isAdmin(session.user.email)}>
      <h1 className="display mb-2 text-4xl text-[var(--indigo)]">Violations</h1>
      <p className="mb-4 text-sm text-[var(--muted)]">
        A violation is <span className="mono">decision=block</span>, while
        stopped is <span className="mono">action_applied</span> in{" "}
        <span className="mono">{"{blocked, rewritten}"}</span>. They are read
        from different fields, so the two counts can disagree.
      </p>
      <PairCount violations={violations} stopped={stopped} />

      {rows.length === 0 ? (
        <p className="mt-6 text-[var(--muted)]">
          No <span className="mono">decision=block</span> records on your
          devices, which is not the same as proving nothing happened.
        </p>
      ) : (
        <div className="mt-6">
          <DecisionRows rows={rows} linkPartition explain />
        </div>
      )}
    </Shell>
  );
}
