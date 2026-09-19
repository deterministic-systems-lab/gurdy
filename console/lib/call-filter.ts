/** Which calls the chain page is showing, and how that is read off the URL. */

export const SHOWN = ["all", "allow", "block"] as const;
export type Shown = (typeof SHOWN)[number];

export const SHOWN_LABEL: Record<Shown, string> = {
  all: "all",
  allow: "allowed",
  block: "blocked",
};

/** A query string is user input. Anything that is not a known filter shows
 *  everything, because hiding rows on the strength of a typo is the one
 *  failure here that a reader cannot see. */
export function asShown(raw: string | string[] | undefined): Shown {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return SHOWN.includes(first as Shown) ? (first as Shown) : "all";
}
