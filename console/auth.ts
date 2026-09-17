import NextAuth from "next-auth";
import PostgresAdapter from "@auth/pg-adapter";
import Resend from "next-auth/providers/resend";
import { authPool } from "@/lib/db";
import { signInEmail } from "@/lib/sign-in-email";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const pool = authPool();
  return {
    adapter: PostgresAdapter(pool),
    trustHost: true,
    providers: [
      Resend({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.EMAIL_FROM,
        // The provider's default mail is a bare button on white. This is the
        // first thing anyone sees of Gurdy, so it gets the same rail, pill
        // and palette as the app.
        async sendVerificationRequest({ identifier, url, provider }) {
          const { subject, html, text } = signInEmail({ url, email: identifier });
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${provider.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: provider.from,
              to: identifier,
              subject,
              html,
              text,
            }),
          });
          if (!res.ok) {
            // Auth.js turns this into the Configuration error the login form
            // already words for the reader. Keep the detail server-side.
            throw new Error(`resend: ${res.status} ${await res.text()}`);
          }
        },
      }),
    ],
    pages: {
      signIn: "/login",
      verifyRequest: "/login/sent",
      error: "/login",
    },
    callbacks: {
      session({ session, user }) {
        session.user.id = String(user.id);
        return session;
      },
    },
  };
});
