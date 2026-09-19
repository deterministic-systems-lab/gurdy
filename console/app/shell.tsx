import Image from "next/image";
import { signOut } from "@/auth";
import { Nav } from "@/app/ui/nav";
import { PillButton, Rail } from "@/app/ui/pop";

export function Shell({
  email,
  admin = false,
  children,
}: {
  email: string | null | undefined;
  admin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="app-stage min-h-screen">
      <div aria-hidden className="app-office">
        <Image
          src="/gurdy-office-bg.png"
          alt=""
          fill
          preload
          sizes="100vw"
          className="app-office-img"
        />
      </div>
      <Rail />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 pl-10">
        {/* The account sits beside the wordmark, not beside the nav. Hung off
            the nav it was pushed to a second line by the fifth pill, and the
            sixth would have done it again. */}
        <header className="mb-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="display text-2xl text-[var(--indigo)]">GURDY</p>
            <div className="flex min-w-0 items-center gap-3 text-sm text-[var(--muted)]">
              <span className="truncate">{email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <PillButton type="submit" variant="ghost">
                  Sign out
                </PillButton>
              </form>
            </div>
          </div>
          <Nav admin={admin} />
        </header>
        {children}
      </div>
    </div>
  );
}
