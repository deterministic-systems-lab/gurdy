import Link from "next/link";
import { SHOWN, SHOWN_LABEL, type Shown } from "@/lib/call-filter";

/** Links, not buttons: the choice belongs in the URL so it survives a reload
 *  and can be sent to someone. The count rides on each one, so landing on an
 *  empty filter is a decision the reader made rather than a surprise. */
export function CallFilter({
  id,
  shown,
  tally,
}: {
  id: string;
  shown: Shown;
  tally: Record<Shown, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SHOWN.map((option) => {
        const on = option === shown;
        return (
          <Link
            key={option}
            href={
              option === "all"
                ? `/chains/${id}#calls`
                : `/chains/${id}?show=${option}#calls`
            }
            aria-current={on ? "true" : undefined}
            className={`pill-btn ${
              on ? "pill-on" : "pill-off"
            } rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-extrabold tracking-tight no-underline`}
          >
            {SHOWN_LABEL[option]}
            <span className="ml-2 tabular-nums opacity-70">{tally[option]}</span>
          </Link>
        );
      })}
    </div>
  );
}
