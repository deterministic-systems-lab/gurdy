"use client";

import { useRef, useState } from "react";
import { PillButton } from "@/app/ui/pop";
import { bundleVerWeb } from "@/lib/bundle-ver";
import { exactBytes, formatBytes } from "@/lib/format";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function PolicyUpload() {
  const [cedar, setCedar] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [packName, setPackName] = useState("");
  const [note, setNote] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const latest = useRef("");

  /** The hash is the pack's identity, so show it before the upload, not after. */
  async function setText(text: string, fileName: string | null) {
    setCedar(text);
    setFileName(fileName);
    if (fileName && !packName.trim()) {
      setPackName(fileName.replace(/\.(cedar|txt)$/i, ""));
    }
    latest.current = text;
    if (!text.trim()) {
      setVer(null);
      return;
    }
    const next = await bundleVerWeb(text);
    // Typing races the digest; only the newest text may set the hash.
    if (latest.current === text) {
      setVer(next);
    }
  }

  async function take(file: File | undefined) {
    if (!file) {
      return;
    }
    setStatus(null);
    // file.text() keeps the bytes as they are on disk, trailing newline included.
    await setText(await file.text(), file.name);
  }

  async function upload() {
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
        setStatus(data.detail || data.error || `upload failed (${res.status})`);
        return;
      }
      const role = data.is_default ? "default pack" : "named pack";
      setStatus(`Published ${data.name ?? packName} as ${role} (${data.bundle_ver}).`);
    } catch {
      setStatus("The request failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        For a pack authored outside this page. Gurdy rejects it if it does not
        compile.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="pill-btn pill-on cursor-pointer rounded-[var(--radius-pill)] px-5 py-2 text-sm font-extrabold tracking-tight">
          Choose a .cedar file
          <input
            type="file"
            accept=".cedar,.txt,text/plain"
            className="sr-only"
            onChange={(e) => take(e.target.files?.[0])}
          />
        </label>
        {fileName ? (
          <span className="mono text-sm text-[var(--muted)]">
            {fileName} ·{" "}
            <span title={exactBytes(byteLength(cedar))}>
              {formatBytes(byteLength(cedar))}
            </span>
          </span>
        ) : null}
      </div>

      {/* The textarea is the drop target itself; wrapping it in a dashed box
          put a container around a container to say the same thing. */}
      <textarea
        value={cedar}
        onChange={(e) => setText(e.target.value, null)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        rows={10}
        className={`field mono block p-4 text-xs ${
          over ? "border-[var(--indigo)] bg-[var(--periwinkle)]" : ""
        }`}
        placeholder="drop a .cedar file here, or paste it"
      />

      {ver ? (
        <p className="text-sm text-[var(--muted)]">
          This uploads as <span className="mono">{ver}</span>. Check it against
          the file you were sent.
        </p>
      ) : null}

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
      <PillButton
        type="button"
        onClick={upload}
        disabled={busy || !cedar.trim() || !packName.trim()}
      >
        {busy ? "Uploading…" : "Upload"}
      </PillButton>
      {status ? (
        <pre className="whitespace-pre-wrap text-sm">{status}</pre>
      ) : null}
    </div>
  );
}
