"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** Two interlocking links, one hash chain per partition. */
function ChainsIcon() {
  return (
    <Glyph>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" />
    </Glyph>
  );
}

/** decision=block. */
function ViolationsIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.2 17.8 17.8 6.2" />
    </Glyph>
  );
}

/** The cedar pack as a document. */
function PolicyIcon() {
  return (
    <Glyph>
      <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M13.5 3v5h5" />
      <path d="M9 13h6M9 16.5h4" />
    </Glyph>
  );
}

/** A machine, because the estate is one row per laptop. */
function FleetIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="11" rx="2" />
      <path d="M2 19.5h20" />
    </Glyph>
  );
}

/** Counts by tool and service. */
function InventoryIcon() {
  return (
    <Glyph>
      <path d="M5 19V11" />
      <path d="M10 19V6" />
      <path d="M15 19v-5" />
      <path d="M20 19v-8" />
      <path d="M3.5 19.5h17" />
    </Glyph>
  );
}

export function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Chains", Icon: ChainsIcon },
    { href: "/violations", label: "Violations", Icon: ViolationsIcon },
    ...(admin
      ? [
          { href: "/policy", label: "Policy", Icon: PolicyIcon, admin: true },
          { href: "/fleet", label: "Fleet", Icon: FleetIcon, admin: true },
          { href: "/inventory", label: "Inventory", Icon: InventoryIcon, admin: true },
        ]
      : []),
  ];
  return (
    // One line, always. Narrow viewports scroll it sideways rather than
    // stacking pills. The negative margin gives the focus ring somewhere to
    // be drawn, since overflow would otherwise clip it.
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.admin ? `${item.label}, admin` : item.label}
            className={`pill-btn ${active ? "pill-on" : "pill-off"} shrink-0 gap-2 rounded-[var(--radius-pill)] px-5 py-2 text-[15px] font-extrabold tracking-tight no-underline`}
          >
            <item.Icon />
            {item.label}
            {item.admin ? <span className="pill-admin-mark">Admin</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
