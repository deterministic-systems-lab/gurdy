import { CATALOG, RULE_LABEL, type PackSummary } from "@/lib/pack";

function globNote(glob: string, id: string): string | null {
  const list =
    id === CATALOG.ids.sensitive_write
      ? CATALOG.write_paths
      : CATALOG.credential_paths;
  return list.find((e) => e.glob === glob)?.note ?? null;
}

export function PackRules({ summary }: { summary: PackSummary }) {
  const forbids = summary.rules.filter((r) => r.kind === "forbid");
  if (forbids.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        This pack has no forbids. Cedar defaults to deny, so the permit-all
        underneath would allow every connected call.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {forbids.map((rule) => (
        <li key={rule.id}>
          <p className="font-extrabold">{rule.label}</p>
          <p className="mono text-xs text-[var(--muted)]">
            {rule.id}
            {rule.action ? ` · ${rule.action}` : ""}
          </p>
          {rule.paths.length > 0 ? (
            <ul className="mt-1 text-sm">
              {rule.paths.map((glob) => {
                const note = globNote(glob, rule.id);
                return (
                  <li key={glob}>
                    path <span className="mono">{glob}</span>
                    {note ? (
                      <span className="text-[var(--muted)]"> — {note}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {rule.tools.length > 0 ? (
            <p className="mt-1 text-sm">
              tool{" "}
              {rule.tools.map((t, i) => (
                <span key={t}>
                  {i > 0 ? ", " : ""}
                  <span className="mono">{t}</span>
                </span>
              ))}
            </p>
          ) : null}
          {rule.notes.length > 0 ? (
            <ul className="mt-1 text-sm text-[var(--muted)]">
              {rule.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
      {summary.permit ? (
        <li className="text-sm text-[var(--muted)]">
          {RULE_LABEL["allow-all-monitor"]}. Shadow still records; enforce is
          what stops a matching call.
        </li>
      ) : null}
    </ul>
  );
}
