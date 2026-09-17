"use client";

import { useEffect, useState } from "react";
import {
  RELATIVE_WINDOW_MS,
  formatAbsolute,
  formatTs,
  humanTs,
  toDate,
} from "@/lib/format";

const TICK_MS = 60_000;

/**
 * The server cannot know the reader's time zone, so it renders UTC and the
 * browser swaps in local wording once mounted. Formatting local on the server
 * would disagree with the client and break hydration.
 *
 * The exact UTC stays on the title, so the precise instant is always one hover
 * away even when the text says "4 minutes ago".
 */
export function Time({ at }: { at: string | Date | null | undefined }) {
  const parsed = toDate(at);
  const ms = parsed ? parsed.getTime() : null;
  const [text, setText] = useState(() => formatAbsolute(parsed, "UTC"));

  useEffect(() => {
    if (ms === null) {
      return;
    }
    const show = () => setText(humanTs(new Date(ms)));
    show();
    // Only a recent stamp is worded relatively, so only that one goes stale.
    if (Date.now() - ms >= RELATIVE_WINDOW_MS) {
      return;
    }
    const id = window.setInterval(show, TICK_MS);
    return () => window.clearInterval(id);
  }, [ms]);

  if (!parsed) {
    return <>{at ? "unknown" : "never"}</>;
  }
  return (
    <time dateTime={parsed.toISOString()} title={formatTs(parsed)}>
      {text}
    </time>
  );
}
