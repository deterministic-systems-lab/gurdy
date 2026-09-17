"use client";

import { useEffect, useState } from "react";

const COPIED_MS = 2000;

function CopyIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** A command block with a copy control in the corner. */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("The browser blocked the clipboard. Select the text and copy it.");
    }
  }

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <pre className="mono overflow-x-auto whitespace-pre-wrap break-all bg-[var(--paper)] py-3 pr-14 pl-4">
          {text}
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy the ${label}`}
          title={copied ? "Copied" : "Copy"}
          className={`pill-btn absolute top-2 right-2 h-9 w-9 rounded-full border-2 bg-white ${
            copied
              ? "border-[var(--mint-dark)] text-[var(--mint-dark)]"
              : "border-[var(--indigo)] text-[var(--indigo)] hover:bg-[var(--periwinkle)]"
          }`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      {error ? <p className="text-[var(--coral-ink)]">{error}</p> : null}
      <p role="status" className="sr-only">
        {copied ? `${label} copied` : ""}
      </p>
    </div>
  );
}
