/** 15 minutes without a heartbeat. */
export const STALE_AFTER_S = 900;

export type Lag =
  | "never_seen"
  | "stale"
  | "pack_lag"
  | "enforce_lag"
  | "revoked";

/** TIMESTAMPTZ arrives as a Date from the driver and as a string over JSON. */
type Ts = string | Date | null;

export function deviceLag(
  row: {
    revoked_at: Ts;
    last_seen_at: Ts;
    observed_bundle_ver: string | null;
    enforce_applied: boolean | null;
  },
  desired: { bundle_ver: string | null; enforce: boolean },
  nowMs: number,
  staleAfterS: number = STALE_AFTER_S,
): Lag[] {
  const flags: Lag[] = [];
  if (row.revoked_at) {
    flags.push("revoked");
  }
  if (!row.last_seen_at) {
    flags.push("never_seen");
    return flags;
  }
  const seen =
    row.last_seen_at instanceof Date
      ? row.last_seen_at.getTime()
      : Date.parse(row.last_seen_at);
  if (!Number.isFinite(seen) || nowMs - seen > staleAfterS * 1000) {
    flags.push("stale");
  }
  if (desired.bundle_ver && row.observed_bundle_ver !== desired.bundle_ver) {
    flags.push("pack_lag");
  }
  if (Boolean(row.enforce_applied) !== desired.enforce) {
    flags.push("enforce_lag");
  }
  return flags;
}
