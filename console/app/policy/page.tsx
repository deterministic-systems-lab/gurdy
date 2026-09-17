import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";
import { Shell } from "@/app/shell";
import { Time } from "@/app/ui/time";
import { Chip } from "@/app/ui/pop";
import { SetDefaultButton } from "@/app/ui/fleet-actions";
import { MintAdminToken } from "@/app/ui/mint-admin-token";
import { PolicyBuilder } from "@/app/ui/policy-builder";
import { PolicyUpload } from "@/app/ui/policy-upload";

type PolicyRow = {
  bundle_ver: string;
  name: string | null;
  uploaded_by: string;
  note: string | null;
  is_current: boolean;
  in_catalog: boolean;
  is_default: boolean;
  created_at: Date;
  decisions: number;
  devices: number;
};

export default async function PolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return (
      <Shell email={session?.user?.email} admin={false}>
        <p>Only an address in ADMIN_EMAILS can open Policy.</p>
      </Shell>
    );
  }
  const rawFrom = (await searchParams).from;
  const from = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
  const db = sql();
  const policies = (await db`
    SELECT
      p.bundle_ver, p.name, p.uploaded_by, p.note, p.is_current, p.created_at,
      (s.name IS NOT NULL) AS in_catalog,
      COALESCE(s.is_default, false) AS is_default,
      (SELECT count(*)::int FROM decisions d WHERE d.bundle_ver = p.bundle_ver) AS decisions,
      (SELECT count(DISTINCT c.device_id)::int
         FROM decisions d
         JOIN chains c ON c.id = d.chain_id
        WHERE d.bundle_ver = p.bundle_ver) AS devices
    FROM policies p
    LEFT JOIN policy_sets s ON s.bundle_ver = p.bundle_ver AND s.name = p.name
    ORDER BY p.created_at DESC
  `) as PolicyRow[];

  return (
    <Shell email={session.user.email} admin>
      <h1 className="display mb-2 text-4xl text-[var(--indigo)]">Policy</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--muted)]">
        Named packs live in the catalog. One of them is the estate default.
        Check boxes to compose a pack, or inspect a version to see what it
        forbids. Fleet assigns a name to a person; republishing that name
        moves them on the next ship. The hash is still the content identity.
      </p>
      <div className="grid gap-4">
        <PolicyBuilder from={from} />
        <details className="card px-6 py-5">
          <summary className="cursor-pointer font-extrabold text-[var(--indigo)]">
            Paste or drop a .cedar file
          </summary>
          <div className="mt-4">
            <PolicyUpload />
          </div>
        </details>
        <MintAdminToken />
      </div>
      {policies.length === 0 ? (
        <p className="mt-8 text-[var(--muted)]">No versions uploaded yet.</p>
      ) : (
        <>
          <h2 className="display mt-10 mb-3 text-2xl">Versions</h2>
          <div className="card overflow-hidden">
            <ul className="row-list">
              {policies.map((p) => (
                <li
                  key={p.bundle_ver}
                  className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 pr-6 pl-6 ${
                    p.is_default ? "row-current" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/policy/${encodeURIComponent(p.bundle_ver)}`}
                        className="font-extrabold break-all"
                      >
                        {p.name ?? p.bundle_ver}
                      </Link>
                      {p.is_default ? <Chip tone="verified">default</Chip> : null}
                      {p.in_catalog && !p.is_default && p.name ? (
                        <SetDefaultButton name={p.name} />
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      <span className="mono">{p.bundle_ver}</span>
                      {" · "}
                      {p.uploaded_by} · <Time at={p.created_at} />
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums text-[var(--muted)]">
                    <Link href={`/policy/${encodeURIComponent(p.bundle_ver)}`}>
                      Inspect
                    </Link>
                    {" · "}
                    <span className="font-extrabold text-[var(--ink)]">{p.devices}</span>{" "}
                    device{p.devices === 1 ? "" : "s"} ·{" "}
                    <span className="font-extrabold text-[var(--ink)]">{p.decisions}</span>{" "}
                    decision{p.decisions === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Shell>
  );
}
