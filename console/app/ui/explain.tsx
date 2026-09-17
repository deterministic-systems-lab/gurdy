"use client";

import { useState } from "react";

/**
 * A model's reading of one decision row. It is labelled as generated because
 * the three fields beside it are the evidence and this is not; the page must
 * not let a sentence a model wrote pass for the record.
 */
export function ExplainButton({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${id}/explain`, {
        method: "POST",
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setError(data.error ?? `failed (${res.status})`);
        return;
      }
      setText(data.text);
    } catch {
      setError("request failed");
    } finally {
      setBusy(false);
    }
  }

  if (text) {
    return (
      <p className="explain-note mt-2 sm:ml-[9.75rem]">
        <span className="explain-tag">Generated</span> {text}
      </p>
    );
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 sm:ml-[9.75rem]">
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className="explain-btn"
        aria-label="Explain this decision in plain English"
      >
        {busy ? "Reading the record…" : "Explain"}
      </button>
      {error ? (
        <span className="text-xs text-[var(--coral-ink)]">{error}</span>
      ) : null}
    </p>
  );
}
