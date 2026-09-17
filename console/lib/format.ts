/** Timestamps in two registers.
 *
 * `formatTs` is the exact UTC reading. It stays the audit value and the
 * tooltip, because an evidence tool should always be able to show the precise
 * instant. The human forms are what the page itself prints.
 *
 * Postgres TIMESTAMPTZ arrives as a Date, and React throws on a Date child,
 * so every timestamp goes through here rather than into JSX directly.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const KIB = 1024;
const BYTE_UNITS = ["KB", "MB", "GB", "TB"];

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  // Postgres hands back bigint columns as strings.
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Digit grouping, so a six-figure count is not read one digit at a time. */
export function formatCount(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? "unknown" : new Intl.NumberFormat("en-GB").format(n);
}

/** Split, so a caller can set the number and its unit at different sizes. */
export function bytesParts(value: number | string | null | undefined): {
  value: string;
  unit: string;
} {
  const n = toNumber(value);
  if (n === null || n < 0) {
    return { value: "unknown", unit: "" };
  }
  if (n < KIB) {
    return { value: String(n), unit: n === 1 ? "byte" : "bytes" };
  }
  let size = n / KIB;
  let step = 0;
  while (size >= KIB && step < BYTE_UNITS.length - 1) {
    size /= KIB;
    step += 1;
  }
  // One decimal under 10, so 9.4 MB does not collapse to a flat 9 MB.
  return {
    value: size.toFixed(size < 10 ? 1 : 0),
    unit: BYTE_UNITS[step] ?? "TB",
  };
}

/** `375 KB`. */
export function formatBytes(value: number | string | null | undefined): string {
  const { value: size, unit } = bytesParts(value);
  return unit ? `${size} ${unit}` : size;
}

/** The exact count, for a tooltip. A rounded size hides the real number. */
export function exactBytes(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null || n < 0) {
    return "unknown";
  }
  return `${formatCount(n)} ${n === 1 ? "byte" : "bytes"}`;
}

/** Past about a week, "n days ago" stops helping and a date reads better. */
export const RELATIVE_WINDOW_MS = 7 * DAY;

export function toDate(ts: string | Date | null | undefined): Date | null {
  if (!ts) {
    return null;
  }
  const at = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Exact UTC: `2026-09-15 19:08Z`. */
export function formatTs(ts: string | Date | null | undefined): string {
  if (!ts) {
    return "never";
  }
  const at = toDate(ts);
  if (!at) {
    return "unknown";
  }
  return `${at.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

/** `15 Sep 2026 at 14:32`, in `tz`, or the reader's own zone when omitted. */
export function formatAbsolute(
  ts: string | Date | null | undefined,
  tz?: string,
): string {
  const at = toDate(ts);
  if (!at) {
    return ts ? "unknown" : "never";
  }
  // en-GB abbreviates September to "Sept", which leaves one ragged row in a
  // column of three-letter months, so take the parts and clip it back.
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(at);
  return `${part("day")} ${part("month").slice(0, 3)} ${part("year")} at ${time}`;
}

/** Null when the gap is too wide to put in words, so the caller shows a date. */
export function formatRelative(
  ts: string | Date | null | undefined,
  now = Date.now(),
): string | null {
  const at = toDate(ts);
  if (!at) {
    return null;
  }
  const gap = now - at.getTime();
  // A device clock ahead of ours is skew, not the future. Show the date.
  if (gap < 0) {
    return null;
  }
  if (gap < 45 * 1000) {
    return "just now";
  }
  if (gap < 90 * 1000) {
    return "a minute ago";
  }
  if (gap < HOUR) {
    return `${Math.round(gap / MINUTE)} minutes ago`;
  }
  if (gap < 90 * MINUTE) {
    return "an hour ago";
  }
  if (gap < DAY) {
    return `${Math.round(gap / HOUR)} hours ago`;
  }
  if (gap < 2 * DAY) {
    return "yesterday";
  }
  if (gap < RELATIVE_WINDOW_MS) {
    return `${Math.floor(gap / DAY)} days ago`;
  }
  return null;
}

/** What a page prints: recent times in words, older ones as a date. */
export function humanTs(
  ts: string | Date | null | undefined,
  now = Date.now(),
  tz?: string,
): string {
  const at = toDate(ts);
  if (!at) {
    return ts ? "unknown" : "never";
  }
  return formatRelative(at, now) ?? formatAbsolute(at, tz);
}
