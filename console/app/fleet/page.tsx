import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { Shell } from "@/app/shell";
import { StatRow } from "@/app/ui/pop";
import { EnforceToggle, PackAssign } from "@/app/ui/fleet-actions";
import { Time } from "@/app/ui/time";
import { listFleet } from "@/lib/fleet";
import { ledgerFacts, pendingInstalls } from "@/lib/queries";
import { Field, MachineCard } from "@/app/ui/fleet-card";

export default async function FleetPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return (
      <Shell email={session?.user?.email} admin={false}>
        <p>Only an address in ADMIN_EMAILS can open Fleet.</p>
      </Shell>
    );
  }

  const [fleet, facts, pending] = await Promise.all([
    listFleet(),
    ledgerFacts(),
    pendingInstalls(),
  ]);
  const byDevice = new Map(facts.map((f) => [f.device_id, f]));
  const checkedIn = fleet.devices.filter((d) => d.last_seen_at).length;
  const silent = fleet.devices.length - checkedIn;
  const inSync = fleet.devices.filter((d) => d.lag.length === 0).length;
  const staleMinutes = Math.round(fleet.stale_after_s / 60);
  const defaultName =
    fleet.policy_sets.find((s) => s.is_default)?.name ?? fleet.desired.policy_name;
  const packNames = fleet.policy_sets.map((s) => s.name);

  return (
    <Shell email={session.user.email} admin>
      <h1 className="display mb-2 text-4xl text-[var(--indigo)]">Fleet</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--muted)]">
        Desired state against what each machine reports. The heartbeat gives the
        running state, while a decision <span className="mono">bundle_ver</span>{" "}
        only gives the pack that some past call ran under, so each card shows
        both. A machine appears here after its first verified push.
      </p>

      <section className="card mb-8 space-y-4 px-6 py-5">
        <h2 className="display text-xl text-[var(--indigo)]">Desired</h2>
        <dl className="grid gap-2 sm:grid-cols-3">
          <Field
            label="default pack"
            value={fleet.desired.policy_name ?? fleet.desired.bundle_ver ?? "none published"}
            mono
          />
          <Field
            label="default hash"
            value={fleet.desired.bundle_ver ?? "none published"}
            mono
          />
          <Field
            label="mode"
            value={fleet.desired.enforce ? "enforce" : "shadow"}
          />
          <Field
            label="set at"
            value={<Time at={fleet.desired.updated_at} />}
          />
        </dl>
        <EnforceToggle enforce={fleet.desired.enforce} />
        <p className="text-sm text-[var(--muted)]">
          Desired enforce is estate-wide. Packs are named; unassigned people
          follow the default. Each machine pulls its person&apos;s pack, writes{" "}
          <span className="mono">~/.gurdy/policy/current.cedar</span> and{" "}
          <span className="mono">~/.gurdy/state/enforce</span>, then reports
          back what it applied. A machine changes on its next 30-second ship,
          not on this click. Native hooks re-read the enforce file per call.
          Wrapped MCP still needs a Cursor restart.
        </p>
      </section>

      <div className="mb-8">
        {/* No coral on these. They count the machines that are fine; painting
            that number red says the wrong one is the problem. The shortfall is
            the denominator, and the line below names it. */}
        <StatRow
          items={[
            { label: "machines", value: fleet.devices.length },
            { label: "checked in", value: checkedIn, of: fleet.devices.length },
            { label: "in sync", value: inSync, of: fleet.devices.length },
          ]}
        />
        {silent > 0 ? (
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            {silent} machine{silent === 1 ? " has" : "s have"} never sent a
            heartbeat. {silent === 1 ? "It" : "They"} pushed a ledger at least
            once, which is what registered {silent === 1 ? "it" : "them"}, but{" "}
            {silent === 1 ? "has" : "have"} not reported state since.
          </p>
        ) : null}
      </div>

      <section className="mb-8 space-y-3">
        <h2 className="display text-2xl">People</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          One pack per account. Every machine that person owns pulls it.
          Estate default tracks whichever pack is marked default, including
          later republishes of that name.
        </p>
        {fleet.people.length === 0 ? (
          <p className="text-[var(--muted)]">
            No accounts have minted a token or pushed a device yet.
          </p>
        ) : (
          <div className="card overflow-hidden">
            <ul className="row-list">
              {fleet.people.map((person) => (
                <li
                  key={person.user_id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4"
                >
                  <span className="font-extrabold">{person.email}</span>
                  <PackAssign
                    userId={person.user_id}
                    assignedName={person.assigned_name}
                    defaultName={defaultName}
                    names={packNames}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {fleet.devices.length === 0 ? (
        <p className="text-[var(--muted)]">
          No machine has pushed yet. A device registers on its first verified
          push, not at the moment someone mints a token.
        </p>
      ) : (
        <ul className="grid gap-4">
          {fleet.devices.map((d) => (
            <MachineCard
              key={d.id}
              d={d}
              f={byDevice.get(d.id)}
              desired={fleet.desired}
            />
          ))}
        </ul>
      )}

      <p className="mt-6 max-w-2xl text-sm text-[var(--muted)]">
        A heartbeat older than {staleMinutes} minutes is stale. Ships run every
        30 seconds; that window is wall-clock quiet, not a missed-tick count.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        The asserted conversation is a claim from the sidecar, not proof of who
        ran the call.
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="display text-2xl">Minted, never pushed</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          These accounts hold a token that no machine has used. Either nobody
          ran the installer, or every push failed.
        </p>
        {pending.length === 0 ? (
          <p className="text-[var(--muted)]">
            Every account that minted a token has pushed with it.
          </p>
        ) : (
          <div className="card overflow-hidden">
            <ul className="row-list">
              {pending.map((p) => (
                <li
                  key={p.owner}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-4 text-sm"
                >
                  <span className="font-extrabold">{p.owner}</span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {p.tokens} token{p.tokens === 1 ? "" : "s"} · last minted{" "}
                    <Time at={p.last_minted} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Shell>
  );
}
