"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/app/ui/pop";

async function failureText(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `failed (${res.status})`;
}

export function EnforceToggle({ enforce }: { enforce: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enforce;
    const ask = next
      ? "Set the desired mode to enforce? Each machine applies it on its next 30-second ship. Native hooks pick it up on the next call; wrapped MCP needs a Cursor restart."
      : "Set the desired mode to shadow? Each machine applies it on its next 30-second ship.";
    if (!window.confirm(ask)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fleet/desired", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforce: next }),
      });
      if (!res.ok) {
        setError(await failureText(res));
        return;
      }
      router.refresh();
    } catch {
      setError("request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <PillButton
        type="button"
        variant={enforce ? "indigo" : "ghost"}
        disabled={busy}
        onClick={toggle}
      >
        {enforce ? "Set desired to shadow" : "Set desired to enforce"}
      </PillButton>
      {error ? <span className="text-[var(--coral-ink)]">{error}</span> : null}
    </span>
  );
}

export function RevokeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!window.confirm(`Revoke ${name}? Its next push is refused.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fleet/devices/${id}/revoke`, { method: "POST" });
      if (!res.ok) {
        setError(await failureText(res));
        return;
      }
      router.refresh();
    } catch {
      setError("request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <PillButton type="button" variant="ghost" disabled={busy} onClick={revoke}>
        Revoke
      </PillButton>
      {error ? <span className="text-[var(--coral-ink)]">{error}</span> : null}
    </span>
  );
}

export function PackAssign({
  userId,
  assignedName,
  defaultName,
  names,
}: {
  userId: number;
  assignedName: string | null;
  defaultName: string | null;
  names: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fleet/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          policy_name: value === "" ? null : value,
        }),
      });
      if (!res.ok) {
        setError(await failureText(res));
        return;
      }
      router.refresh();
    } catch {
      setError("request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <select
        className="field px-3 py-2 text-sm"
        value={assignedName ?? ""}
        disabled={busy || names.length === 0}
        onChange={onChange}
        aria-label="Policy pack"
      >
        <option value="">
          Estate default{defaultName ? ` (${defaultName})` : ""}
        </option>
        {assignedName && !names.includes(assignedName) ? (
          <option value={assignedName}>{assignedName} (missing)</option>
        ) : null}
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {error ? <span className="text-[var(--coral-ink)]">{error}</span> : null}
    </span>
  );
}

export function SetDefaultButton({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setDefault() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/policy/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setError(await failureText(res));
        return;
      }
      router.refresh();
    } catch {
      setError("request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <PillButton type="button" variant="ghost" disabled={busy} onClick={setDefault}>
        Make default
      </PillButton>
      {error ? <span className="text-[var(--coral-ink)]">{error}</span> : null}
    </span>
  );
}
