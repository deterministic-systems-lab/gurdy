import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { MintToken } from "@/app/ui/mint-token";
import { CoverageChips } from "@/app/ui/fields";
import { Callout } from "@/app/ui/pop";
import { Shell } from "@/app/shell";
import { Time } from "@/app/ui/time";
import { bytesParts, exactBytes, formatCount } from "@/lib/format";
import { chainsForUser, lastAttempt } from "@/lib/queries";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const [chains, last] = await Promise.all([
    chainsForUser(session.user.id),
    lastAttempt(session.user.id),
  ]);

  return (
    <Shell email={session.user.email} admin={isAdmin(session.user.email)}>
      <h1 className="display mb-2 text-4xl text-[var(--indigo)]">
        Your chains
      </h1>
      <p className="mb-6 max-w-2xl text-base text-[var(--muted)]">
        Every chain here came from a device registered to you, and it holds what
        Gurdy managed to record. Whatever the proxy never saw is simply absent.
      </p>

      <div className="mb-8">
        <MintToken />
      </div>

      {last && !last.ok ? (
        <div className="mb-8">
          <Callout tone="coral">
            <p>Your last push failed verification.</p>
            <p className="mono mt-1 font-medium">
              {last.partition ?? "(unknown partition)"} ·{" "}
              <Time at={last.created_at} />
            </p>
            {last.error ? (
              <pre className="mt-2 whitespace-pre-wrap font-medium">
                {last.error}
              </pre>
            ) : null}
          </Callout>
        </div>
      ) : null}

      {chains.length === 0 ? (
        <p className="text-[var(--muted)]">
          No chains yet. Mint a token above, then run the installer in your
          gurdy clone, and the first verified push will pin the signing key for
          this machine.
        </p>
      ) : (
        <ul className="grid gap-4">
          {chains.map((c) => {
            const size = bytesParts(c.byte_len);
            return (
              <li key={c.id}>
                <Link
                  href={`/chains/${c.id}`}
                  className="card card-interactive block px-6 py-5 no-underline"
                >
                  <span className="mono text-lg font-extrabold text-[var(--indigo)]">
                    {c.partition}
                  </span>
                  {/* Gaps, not dots: two big numerals either side of a thin
                      separator read as one merged figure. */}
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
                    <span>
                      {formatCount(c.decisions_count ?? 0)} call
                      {(c.decisions_count ?? 0) === 1 ? "" : "s"}
                    </span>
                    <span>
                      kid <span className="mono">{c.kid}</span>
                    </span>
                    <span>
                      seq{" "}
                      <span className="display text-xl">
                        {c.last_seq === null ? "—" : formatCount(c.last_seq)}
                      </span>
                    </span>
                    <span>
                      size{" "}
                      <span
                        className="display text-xl"
                        title={exactBytes(c.byte_len)}
                      >
                        {size.value}
                      </span>{" "}
                      {size.unit}
                    </span>
                  </p>
                  <CoverageChips chain={c} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
