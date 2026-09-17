"use client";

import { useFormStatus } from "react-dom";
import { requestLink } from "@/app/login/actions";
import { PillButton } from "@/app/ui/pop";

export function LoginForm({ error }: { error?: string }) {
  return (
    <form action={requestLink} className="flex flex-col gap-4">
      {error ? (
        <p className="text-sm text-[var(--coral-ink)]">
          {error === "Configuration"
            ? "Gurdy could not send a link to that address. Try again."
            : `Sign-in failed (${error}). Request a new link.`}
        </p>
      ) : null}
      <SubmitFields />
    </form>
  );
}

function SubmitFields() {
  const { pending } = useFormStatus();
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          disabled={pending}
          className="field px-4 py-3 disabled:opacity-70"
        />
      </label>
      <PillButton type="submit" variant="mint" disabled={pending} aria-busy={pending}>
        {pending ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span
              aria-hidden
              className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Sending the link…
          </span>
        ) : (
          "Email me a sign-in link"
        )}
      </PillButton>
      <p className="min-h-5 text-sm text-[var(--muted)]" aria-live="polite">
        {pending ? "Gurdy is sending the link. This page moves when it is sent." : ""}
      </p>
    </>
  );
}
