import { Rail } from "@/app/ui/pop";

export default function LoginSentPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 pl-10">
      <Rail />
      <p className="display text-2xl text-[var(--indigo)]">GURDY</p>
      <h1 className="display text-6xl text-[var(--indigo)]">Check your email</h1>
      <p className="text-[var(--muted)]">
        A sign-in link is on its way. It expires, so use it soon.
      </p>
    </main>
  );
}
