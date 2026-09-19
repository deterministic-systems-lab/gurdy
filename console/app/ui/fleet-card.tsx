import type { ReactNode } from "react";
import { Chip } from "@/app/ui/pop";
import { RevokeButton } from "@/app/ui/fleet-actions";
import { Time } from "@/app/ui/time";
import { formatCount } from "@/lib/format";
import type { FleetDevice, Lag } from "@/lib/fleet";
import type { LedgerFacts } from "@/lib/queries";

const LAG_LABEL: Record<Lag, string> = {
  never_seen: "never checked in",
  stale: "stale heartbeat",
  pack_lag: "behind pack",
  enforce_lag: "enforce not applied",
  revoked: "revoked",
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string");
}

function asPairs(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return (
    Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)] as const)
      // An empty surface is not a surface. `http=` with nothing after it read
      // as a truncated value rather than "no HTTP surface is wrapped".
      .filter(([, v]) => v !== "" && v !== "false" && v !== "null")
      .map(([k, v]) => (v === "true" ? k : `${k}=${v}`))
  );
}

/** A reported value with how it compares to what the fleet was told to run. */
function Now({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd
        className={`mono mt-1 text-base font-extrabold break-all ${
          warn ? "text-[var(--coral-ink)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </dd>
      <dd
        className={`mt-0.5 text-xs ${
          warn ? "text-[var(--coral-ink)]" : "text-[var(--muted)]"
        }`}
      >
        {note}
      </dd>
    </div>
  );
}

/** Heartbeat hostname is the machine. Fall back to what the chains reported. */
export function machineName(
  device: FleetDevice,
  facts: LedgerFacts | undefined,
): string {
  return device.hostname || facts?.instances.join(", ") || `kid ${device.kid}`;
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  // No tile. Twelve filled boxes inside a card is boxes inside boxes; the
  // label already separates these, and a rule is cheaper than a container.
  return (
    <div className="border-t border-[var(--line)] pt-2">
      <dt className="text-xs tracking-wide text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd className={`text-sm break-all ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  );
}

/** One machine: whether it is doing what it was told, then everything else. */
export function MachineCard({
  d,
  f,
  desired,
}: {
  d: FleetDevice;
  f: LedgerFacts | undefined;
  /** Estate-wide enforce. Pack is judged against this device's assigned pack. */
  desired: { enforce: boolean };
}) {
  const ledgers = asStringList(d.ledgers);
  const surfaces = asPairs(d.surfaces);
  const packMatches =
    !d.desired_bundle_ver || d.observed_bundle_ver === d.desired_bundle_ver;
  const enforceMatches = Boolean(d.enforce_applied) === desired.enforce;
  const packRole = d.assigned_policy_name
    ? `assigned ${d.desired_policy_name}`
    : d.desired_policy_name
      ? `estate default ${d.desired_policy_name}`
      : "no pack published";

  return (
    <li key={d.id} className="card px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="display text-2xl break-all text-[var(--indigo)]">
          {machineName(d, f)}
        </p>
        <span className="flex flex-wrap gap-2">
          {d.lag.length === 0 ? (
            <Chip tone="verified">in sync</Chip>
          ) : (
            d.lag.map((flag) => (
              <Chip
                key={flag}
                tone={flag === "never_seen" ? "lavender" : "coral"}
              >
                {LAG_LABEL[flag]}
              </Chip>
            ))
          )}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {d.email ?? "no owner"} · {d.os ?? "os unknown"} ·{" "}
        {d.shipper ?? "no shipper"}
      </p>

      {/* The whole point of the page: what it is running against
            what it was told to run. Given the most weight on the card
            so it is not one pair among thirteen. */}
      <dl className="mt-4 grid gap-4 border-t-2 border-[var(--line)] pt-3 sm:grid-cols-3">
        <Now
          label="pack"
          value={d.observed_bundle_ver ?? "none reported"}
          note={
            packMatches
              ? packRole
              : `desired is ${d.desired_policy_name ?? d.desired_bundle_ver}`
          }
          warn={!packMatches}
        />
        <Now
          label="enforce"
          value={
            d.enforce_applied === null
              ? "not reported"
              : d.enforce_applied
                ? "on"
                : "off"
          }
          note={
            enforceMatches
              ? "matches desired"
              : `desired is ${desired.enforce ? "on" : "off"}`
          }
          warn={!enforceMatches}
        />
        <Now
          label="last heartbeat"
          value={<Time at={d.last_seen_at} />}
          note={d.lag.includes("stale") ? "gone quiet" : "reporting"}
          warn={d.lag.includes("stale") || !d.last_seen_at}
        />
      </dl>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Has pushed{" "}
        <strong className="text-[var(--ink)]">
          {formatCount(f?.records ?? 0)}
        </strong>{" "}
        records over {formatCount(f?.partitions ?? 0)} chain
        {f?.partitions === 1 ? "" : "s"}, holding{" "}
        <strong className="text-[var(--ink)]">
          {formatCount(f?.decisions ?? 0)}
        </strong>{" "}
        calls, of which{" "}
        <strong className="text-[var(--ink)]">
          {formatCount(f?.violations ?? 0)}
        </strong>{" "}
        broke policy and {formatCount(f?.enforced ?? 0)}{" "}
        {f?.enforced === 1 ? "was" : "were"} actually stopped. Last push{" "}
        <Time at={f?.last_push ?? null} />, first seen{" "}
        <Time at={f?.created_at ?? null} />.
      </p>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-extrabold text-[var(--indigo)]">
          Identifiers and paths
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="device kid" value={d.kid} mono />
          <Field label="policy file" value={d.policy_path ?? "—"} mono />
          <Field label="build" value={f?.producers.join(", ") || "—"} mono />
          <Field label="git head" value={d.git_head ?? "—"} mono />
          <Field
            label="wrapped"
            value={f?.workloads.join(", ") || "none recorded"}
            mono
          />
          <Field label="ledgers" value={ledgers.join(", ") || "—"} mono />
          <Field label="surfaces" value={surfaces.join(" · ") || "—"} mono />
          <Field
            label="pack at last call"
            value={f?.last_decision_bundle ?? "—"}
            mono
          />
          <Field
            label="asserted conversation"
            value={d.asserted_conversation_id ?? "—"}
            mono
          />
        </dl>
      </details>

      <div className="mt-4">
        {d.revoked_at ? (
          <p className="text-sm text-[var(--coral-ink)]">
            revoked <Time at={d.revoked_at} />
          </p>
        ) : (
          <RevokeButton id={d.id} name={machineName(d, f)} />
        )}
      </div>
    </li>
  );
}
