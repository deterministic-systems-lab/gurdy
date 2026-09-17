"use client";

import { useState } from "react";
import { CopyBlock } from "@/app/ui/copy-block";
import { PillButton } from "@/app/ui/pop";

function installCommand(origin: string, token: string): string {
  return `curl -fsSL ${origin}/install-push.sh | sh -s -- '${token}'`;
}

export function MintToken() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "${GURDY_DASHBOARD_URL}";

  async function mint() {
    setError(null);
    const res = await fetch("/api/device-tokens", { method: "POST" });
    const data = (await res.json()) as { token?: string; error?: string };
    if (!res.ok || !data.token) {
      setError(data.error ?? `mint failed (${res.status})`);
      return;
    }
    setToken(data.token);
  }

  return (
    <section className="card space-y-4 px-6 py-5 text-sm">
      <h2 className="display text-xl text-[var(--indigo)]">Device token</h2>
      <p>
        This token only lets the shipper sign in; it is not the ledger signing
        key. Paste the command into a terminal and you will not need a clone
        first. Gurdy shows it once.
      </p>
      {token ? (
        <>
          <CopyBlock text={installCommand(origin, token)} label="install command" />
          <p className="text-[var(--muted)]">
            Clones the overlay into <span className="mono">~/gurdy</span> if
            needed, writes <span className="mono">~/.gurdy/push.env</span>,
            loads the 30-second timer, installs Cursor hooks, and ships{" "}
            <span className="mono">~/.gurdy/ledger</span> once if it exists.
            Restart Cursor after.{" "}
            <span className="mono">GURDY_SKIP_CURSOR=1</span> skips hooks;{" "}
            <span className="mono">GURDY_ROOT</span> uses an existing checkout.
          </p>
        </>
      ) : (
        <PillButton type="button" onClick={mint}>
          Mint a device token
        </PillButton>
      )}
      {error ? <p className="text-[var(--coral-ink)]">{error}</p> : null}
    </section>
  );
}
