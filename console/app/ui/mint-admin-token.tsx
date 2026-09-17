"use client";

import { useState } from "react";
import { CopyBlock } from "@/app/ui/copy-block";
import { PillButton } from "@/app/ui/pop";

function publishCommand(origin: string, token: string): string {
  return [
    `export GURDY_DASHBOARD_URL='${origin}'`,
    `export GURDY_ADMIN_TOKEN='${token}'`,
    "python3 policy/pack.py publish",
  ].join("\n");
}

export function MintAdminToken() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "${GURDY_DASHBOARD_URL}";

  async function mint() {
    setError(null);
    const res = await fetch("/api/admin-tokens", { method: "POST" });
    const data = (await res.json()) as { token?: string; error?: string };
    if (!res.ok || !data.token) {
      setError(data.error ?? `mint failed (${res.status})`);
      return;
    }
    setToken(data.token);
  }

  return (
    <section className="card space-y-4 px-6 py-5 text-sm">
      <h2 className="display text-xl text-[var(--indigo)]">
        Publish a pack from the CLI
      </h2>
      <p>
        For admins pushing a pack with{" "}
        <span className="mono">python3 policy/pack.py publish</span> instead
        of the checkboxes above. Mint a token, paste the exports in your
        terminal, then run that command from the gurdy repo. Your browser
        session will not work, and neither will a device token. Gurdy shows
        the secret once.
      </p>
      {token ? (
        <CopyBlock text={publishCommand(origin, token)} label="publish commands" />
      ) : (
        <PillButton type="button" onClick={mint}>
          Mint a CLI token
        </PillButton>
      )}
      {error ? <p className="text-[var(--coral-ink)]">{error}</p> : null}
    </section>
  );
}
