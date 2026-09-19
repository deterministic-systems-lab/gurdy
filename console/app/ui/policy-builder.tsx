"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackRules } from "@/app/ui/pack-rules";
import { PillButton } from "@/app/ui/pop";
import { bundleVerWeb } from "@/lib/bundle-ver";
import {
  CATALOG,
  addGlobs,
  cedarFromSelection,
  defaultSelection,
  namedToolLabel,
  parseGlob,
  selectionFromCedar,
  summarizeCedar,
  toggleGlob,
} from "@/lib/pack";

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function AddGlob({
  onAdd,
  placeholder,
}: {
  onAdd: (glob: string) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const glob = parseGlob(value);
    if (!glob) {
      setError("A glob cannot be empty or contain quotes.");
      return;
    }
    setError(null);
    onAdd(glob);
    setValue("");
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="field min-w-56 flex-1 px-4 py-2 text-sm"
          placeholder={placeholder}
        />
        <PillButton type="button" variant="ghost" onClick={submit}>
          Add
        </PillButton>
      </div>
      {error ? <p className="text-sm text-[var(--coral-ink)]">{error}</p> : null}
    </div>
  );
}

export function PolicyBuilder({ from }: { from?: string }) {
  const router = useRouter();
  const initial = defaultSelection();
  const [credentialGlobs, setCredentialGlobs] = useState(initial.credentialGlobs);
  const [writeGlobs, setWriteGlobs] = useState(initial.writeGlobs);
  const [destructive, setDestructive] = useState(initial.destructive);
  const [namedTools, setNamedTools] = useState(initial.namedTools);
  const [unlistedModelHost, setUnlistedModelHost] = useState(
    initial.unlistedModelHost,
  );
  const [packName, setPackName] = useState("");
  const [note, setNote] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [ver, setVer] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  const cedar = useMemo(
    () =>
      cedarFromSelection({
        credentialGlobs,
        writeGlobs,
        destructive,
        namedTools,
        unlistedModelHost,
      }),
    [credentialGlobs, writeGlobs, destructive, namedTools, unlistedModelHost],
  );
  const summary = useMemo(() => summarizeCedar(cedar), [cedar]);
  const credOrder = CATALOG.credential_paths.map((e) => e.glob);
  const extraCred = credentialGlobs.filter((g) => !credOrder.includes(g));
  const extraWrite = writeGlobs.filter(
    (g) => !CATALOG.write_paths.some((e) => e.glob === g),
  );

  useEffect(() => {
    let alive = true;
    bundleVerWeb(cedar).then((next) => {
      if (alive) {
        setVer(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [cedar]);

  useEffect(() => {
    if (!from) {
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/policy/${encodeURIComponent(from)}`);
      const data = (await res.json()) as {
        cedar?: string;
        name?: string | null;
        note?: string | null;
        error?: string;
      };
      if (cancelled) {
        return;
      }
      if (!res.ok || !data.cedar) {
        setStatus(data.error || `Could not load ${from}`);
        return;
      }
      const loaded = selectionFromCedar(data.cedar);
      setCredentialGlobs(loaded.credentialGlobs);
      setWriteGlobs(loaded.writeGlobs);
      setDestructive(loaded.destructive);
      setNamedTools(loaded.namedTools);
      setUnlistedModelHost(loaded.unlistedModelHost);
      if (data.name) {
        setPackName(data.name);
      }
      if (data.note) {
        setNote(data.note);
      }
      setLoadedFrom(from);
    })();
    return () => {
      cancelled = true;
    };
  }, [from]);

  async function publish() {
    setBusy(true);
    setStatus("Checking that the pack compiles…");
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedar,
          note,
          name: packName,
          make_default: makeDefault,
        }),
      });
      const data = (await res.json()) as {
        bundle_ver?: string;
        name?: string;
        is_default?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setStatus(data.detail || data.error || `publish failed (${res.status})`);
        return;
      }
      const role = data.is_default ? "default pack" : "named pack";
      setStatus(`Published ${data.name ?? packName} as ${role} (${data.bundle_ver}).`);
      router.refresh();
    } catch {
      setStatus("The request failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-5 px-6 py-5">
      <div>
        <h2 className="display text-xl text-[var(--indigo)]">Compose a pack</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Check what this pack should forbid. Fleet assigns the name to a
          person; republishing the same name moves them on the next ship. The
          hash is still the content identity.
        </p>
        {loadedFrom ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Starting from <span className="mono">{loadedFrom}</span>. Publish
            under the same name to replace it.
          </p>
        ) : null}
      </div>

      <fieldset className="min-w-0 space-y-3 border-0 p-0">
        <legend className="font-extrabold">Reading secrets</legend>
        <p className="text-sm text-[var(--muted)]">
          Any connected tool whose path matches. Read, Grep, Glob, and MCP
          read_file share this.
        </p>
        {CATALOG.credential_paths.map((item) => (
          <CheckRow
            key={item.glob}
            checked={credentialGlobs.includes(item.glob)}
            onChange={() =>
              setCredentialGlobs(toggleGlob(credentialGlobs, item.glob, credOrder))
            }
          >
            <span className="mono font-extrabold">{item.glob}</span>
            <span className="text-[var(--muted)]"> — {item.note}</span>
          </CheckRow>
        ))}
        {extraCred.map((glob) => (
          <CheckRow
            key={glob}
            checked={credentialGlobs.includes(glob)}
            onChange={() =>
              setCredentialGlobs(toggleGlob(credentialGlobs, glob, credOrder))
            }
          >
            <span className="mono font-extrabold">{glob}</span>
            <span className="text-[var(--muted)]"> — added here</span>
          </CheckRow>
        ))}
        <AddGlob
          placeholder="*/.npmrc"
          onAdd={(glob) => setCredentialGlobs(addGlobs(credentialGlobs, glob, true))}
        />
      </fieldset>

      <fieldset className="min-w-0 space-y-3 border-0 p-0">
        <legend className="font-extrabold">Writing sensitive paths</legend>
        <p className="text-sm text-[var(--muted)]">
          Only <span className="mono">write_file</span>. Ordinary workspace
          writes stay permitted until you add a glob.
        </p>
        {writeGlobs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No write globs in this pack.</p>
        ) : (
          writeGlobs.map((glob) => (
            <CheckRow
              key={glob}
              checked
              onChange={() =>
                setWriteGlobs(writeGlobs.filter((g) => g !== glob))
              }
            >
              <span className="mono font-extrabold">{glob}</span>
              {extraWrite.includes(glob) ? (
                <span className="text-[var(--muted)]"> — added here</span>
              ) : null}
            </CheckRow>
          ))
        )}
        <AddGlob
          placeholder="*/infra/prod/*"
          onAdd={(glob) => setWriteGlobs(addGlobs(writeGlobs, glob, false))}
        />
      </fieldset>

      <fieldset className="min-w-0 space-y-3 border-0 p-0">
        <legend className="font-extrabold">Families</legend>
        <CheckRow checked={destructive} onChange={setDestructive}>
          <span className="font-extrabold">Deletes and rm</span>
          <span className="text-[var(--muted)]">
            {" "}
            — {CATALOG.destructive_tools.map((t) => t.value).join(", ")}
          </span>
        </CheckRow>
        <CheckRow checked={namedTools} onChange={setNamedTools}>
          <span className="font-extrabold">Named network tools</span>
          <span className="text-[var(--muted)]"> — {namedToolLabel()}</span>
        </CheckRow>
        <CheckRow checked={unlistedModelHost} onChange={setUnlistedModelHost}>
          <span className="font-extrabold">Unlisted model host</span>
          <span className="text-[var(--muted)]">
            {" "}
            — does not fire on Composer; there is no chokepoint on model HTTP
          </span>
        </CheckRow>
      </fieldset>

      <div className="space-y-2">
        <p className="font-extrabold">This pack forbids</p>
        <PackRules summary={summary} />
      </div>

      <label className="block text-sm">
        Name
        <input
          value={packName}
          onChange={(e) => setPackName(e.target.value)}
          className="field mt-1 px-4 py-2"
          placeholder="strict"
        />
      </label>
      <label className="block text-sm">
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field mt-1 px-4 py-2"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={makeDefault}
          onChange={(e) => setMakeDefault(e.target.checked)}
        />
        Set as the estate default (unassigned people follow this)
      </label>

      {ver ? (
        <p className="text-sm text-[var(--muted)]">
          This publishes as <span className="mono">{ver}</span>.
        </p>
      ) : null}

      <PillButton
        type="button"
        onClick={publish}
        disabled={busy || !packName.trim()}
      >
        {busy ? "Publishing…" : "Publish"}
      </PillButton>
      {status ? (
        <pre className="whitespace-pre-wrap text-sm">{status}</pre>
      ) : null}
      <details>
        <summary className="cursor-pointer font-extrabold text-[var(--indigo)]">
          Generated Cedar
        </summary>
        <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">
          {cedar}
        </pre>
      </details>
    </section>
  );
}
