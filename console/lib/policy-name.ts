/** Display names for Cedar packs. bundle_ver remains the content identity. */

export function normalizePolicyName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const name = raw.trim().replace(/[ \t]+/g, " ");
  if (name.length < 1 || name.length > 64) {
    return null;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(name)) {
    return null;
  }
  return name;
}

export type NamedPack = {
  name: string;
  bundle_ver: string;
  cedar: string;
  is_default: boolean;
};

/** Assigned set if it still exists, otherwise the default set. */
export function pickPackForUser(
  assignedName: string | null | undefined,
  packs: NamedPack[],
): { pack: NamedPack; assigned: boolean } | null {
  if (assignedName) {
    const hit = packs.find((p) => p.name === assignedName);
    if (hit) {
      return { pack: hit, assigned: true };
    }
  }
  const pack = packs.find((p) => p.is_default) ?? packs[0];
  if (!pack) {
    return null;
  }
  return { pack, assigned: false };
}
