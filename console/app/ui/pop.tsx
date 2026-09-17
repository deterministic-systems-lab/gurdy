import type { ButtonHTMLAttributes, ReactNode } from "react";

const CHIP: Record<string, string> = {
  indigo: "bg-[var(--indigo)] text-[var(--paper)]",
  coral: "bg-[var(--coral)] text-[var(--ink)]",
  lavender: "bg-[var(--lavender)] text-[var(--ink)]",
  verified: "bg-[var(--indigo)] text-[var(--mint)]",
  finding: "bg-[var(--periwinkle)] text-[var(--indigo)]",
  paper: "bg-white text-[var(--ink)] shadow-[var(--shadow-pop)]",
};

const PILL: Record<string, string> = {
  indigo: "pill-on",
  mint: "bg-[var(--mint)] text-[var(--ink)] hover:bg-[var(--mint-light)]",
  ghost: "pill-off",
};

export function Rail() {
  return <div aria-hidden className="rail fixed inset-y-0 left-0 w-3" />;
}

export function Chip({
  children,
  tone = "indigo",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP;
  className?: string;
}) {
  return (
    <span
      className={`chip inline-flex items-center rounded-[var(--radius-pill)] px-3 py-1 text-sm font-semibold ${CHIP[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** One card, divided. A row of identical cards is a layout nobody chose. */
export function StatRow({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    /** Denominator. "2 of 3" shows the shortfall without colouring the 2. */
    of?: number;
    tone?: "indigo" | "coral";
  }[];
}) {
  return (
    <div className="card flex flex-wrap">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`min-w-36 flex-1 px-6 py-5 ${
            i > 0 ? "border-l border-[var(--line)]" : ""
          }`}
        >
          <p className="text-xs font-extrabold tracking-wide text-[var(--muted)] uppercase">
            {item.label}
          </p>
          <p
            className={`stat-num mt-1 text-5xl font-extrabold tracking-tight ${
              item.tone === "coral" ? "text-[var(--coral-ink)]" : "text-[var(--indigo)]"
            }`}
          >
            {item.value}
            {item.of === undefined ? null : (
              <span className="ml-2 text-2xl font-extrabold text-[var(--muted)]">
                of {item.of}
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

export function Callout({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: "ink" | "coral";
}) {
  const styles =
    tone === "coral"
      ? "bg-[var(--coral)] text-[var(--ink)]"
      : "bg-[var(--ink)] text-white";
  return (
    <div
      className={`rounded-[var(--radius-card)] px-5 py-4 font-extrabold ${styles}`}
    >
      {children}
    </div>
  );
}

export function PillButton({
  variant = "indigo",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof PILL;
}) {
  return (
    <button
      className={`pill-btn rounded-[var(--radius-pill)] px-5 py-2 text-sm font-extrabold tracking-tight ${PILL[variant]} ${className}`}
      {...props}
    />
  );
}
