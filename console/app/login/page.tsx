import { LoginForm } from "@/app/login/form";
import { Rail } from "@/app/ui/pop";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-6 pl-10">
      <Rail />
      <header className="space-y-4">
        <p className="display text-2xl text-[var(--indigo)]">GURDY</p>
        <h1 className="display text-6xl text-[var(--indigo)]">
          Sign in with a link
        </h1>
        <p className="text-[var(--muted)]">
          The email is the account. The signing key separates devices, not
          this field.
        </p>
      </header>
      <LoginForm error={error} />
    </main>
  );
}
