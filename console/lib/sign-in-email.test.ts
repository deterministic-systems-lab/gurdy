import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, signInEmail } from "./sign-in-email.ts";

const url = "${GURDY_DASHBOARD_URL}/api/auth/callback/resend?token=abc&email=a%40b.co";

test("the link is in both the button and the pasteable fallback", () => {
  const { html, text } = signInEmail({ url, email: "dev@example.com" });
  // Escaped in the href, and again in the visible block below it.
  assert.equal(html.split("token=abc&amp;email=a%40b.co").length - 1, 2);
  assert.ok(text.includes(url), "the plain-text part must carry the raw link");
});

test("an address cannot inject markup", () => {
  const { html } = signInEmail({
    url,
    email: '"><script>alert(1)</script>@evil.test',
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("the subject and button name the host the link goes to", () => {
  const { subject, html } = signInEmail({ url, email: "dev@example.com" });
  assert.equal(subject, "Sign in to your-console-host");
  assert.match(html, /Sign in to gurdy\.vercel\.app/);
});

test("the image is absolute, since mail clients have no page to be relative to", () => {
  const { html } = signInEmail({ url, email: "dev@example.com" });
  assert.match(html, /src="https:\/\/gurdy\.vercel\.app\/gurdy-buddy\.png"/);
  assert.match(html, /alt="[^"]+"/, "a blocked image still has to say what it was");
});

test("a malformed callback url does not break the template", () => {
  const { html, subject } = signInEmail({ url: "not-a-url", email: "a@b.co" });
  assert.ok(html.includes("not-a-url"));
  assert.equal(subject, "Sign in to your-console-host");
});

test("escapeHtml covers the five that matter in an attribute", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});
