import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";
import { summarizeCedar } from "@/lib/pack";
import { Shell } from "@/app/shell";
import { CopyBlock } from "@/app/ui/copy-block";
import { SetDefaultButton } from "@/app/ui/fleet-actions";
import { PackRules } from "@/app/ui/pack-rules";
import { Chip } from "@/app/ui/pop";
import { Time } from "@/app/ui/time";

type PolicyInspect = {
  bundle_ver: string;
  name: string | null;
  cedar_text: string;
  uploaded_by: string;
  note: string | null;
  created_at: Date;
  in_catalog: boolean;
  is_default: boolean;
};

export default async function PolicyInspectPage({
  params,
}: {
  params: Promise<{ ver: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return (
      <Shell email={session?.user?.email} admin={false}>
        <p>Only an address in ADMIN_EMAILS can open Policy.</p>
      </Shell>
    );
  }
  const ver = decodeURIComponent((await params).ver);
  const db = sql();
  const rows = (await db`
    SELECT
      p.bundle_ver, p.name, p.cedar_text, p.uploaded_by, p.note, p.created_at,
      (s.name IS NOT NULL) AS in_catalog,
      COALESCE(s.is_default, false) AS is_default
    FROM policies p
    LEFT JOIN policy_sets s ON s.bundle_ver = p.bundle_ver AND s.name = p.name
    WHERE p.bundle_ver = ${ver}
    LIMIT 1
  `) as PolicyInspect[];
  const pack = rows[0];
  if (!pack) {
    notFound();
  }
  const summary = summarizeCedar(pack.cedar_text);
  const title = pack.name ?? pack.bundle_ver;

  return (
    <Shell email={session.user.email} admin>
      <p className="mono text-xs text-[var(--muted)]">
        <Link href="/policy">policy</Link> / {title}
      </p>
      <h1 className="display mt-2 text-4xl text-[var(--indigo)]">{title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        {pack.is_default ? <Chip tone="verified">default</Chip> : null}
        {pack.in_catalog && !pack.is_default && pack.name ? (
          <SetDefaultButton name={pack.name} />
        ) : null}
      </p>
      <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
        <span className="mono">{pack.bundle_ver}</span>
        {" · "}
        {pack.uploaded_by} · <Time at={pack.created_at} />
        {pack.note ? ` · ${pack.note}` : ""}
      </p>
      <p className="mt-2 text-sm">
        <Link href={`/policy?from=${encodeURIComponent(pack.bundle_ver)}`}>
          Open in the builder
        </Link>
        {" to publish a variant or replace this name."}
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="display text-2xl">What it forbids</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Read from the Cedar that was stored. Request bodies are not in the
          pack. Enforce is estate-wide; this page does not turn it on.
        </p>
        <div className="card px-6 py-5">
          <PackRules summary={summary} />
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="display text-2xl">Cedar</h2>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          The hash is SHA-256 of these bytes. A trailing newline is a
          different pack.
        </p>
        <CopyBlock text={pack.cedar_text} label="Cedar pack" />
      </section>
    </Shell>
  );
}
