/** The magic-link email.
 *
 * Mail clients are not browsers: no external stylesheet, no custom webfont
 * worth relying on, and Outlook still renders through Word. So this is tables
 * and inline styles on purpose, and the palette is repeated as literals
 * because an email cannot read globals.css.
 */

const INDIGO = "#10069f";
const INDIGO_DEEP = "#0100a0";
const MINT = "#00d4a7";
const PAPER = "#f0f5ff";
const PERIWINKLE = "#e0e9ff";
const INK = "#141414";
const MUTED = "#3d3d4a";
const LINE = "#c9d2e8";

const SANS = "'Outfit','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace";

/** The address is user input and lands in markup, so it is escaped. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
    } catch {
    return "${GURDY_DASHBOARD_URL}";
  }
}

export function signInEmail({ url, email }: { url: string; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const origin = originOf(url);
  const host = origin.replace(/^https?:\/\//, "");
  const safeUrl = escapeHtml(url);
  const safeEmail = escapeHtml(email);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Sign in to Gurdy</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
Your sign-in link for ${host}. It expires.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};padding:32px 12px;">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 11px 30px rgba(154,161,177,0.2);">
<tr>
<!-- The indigo rail down the left, same as every page of the app. -->
<td width="12" style="width:12px;background:${INDIGO};">&nbsp;</td>
<td style="padding:36px 40px 40px 34px;">

<img src="${origin}/gurdy-buddy.png" width="180" height="99" alt="The gurdy, a hurdy-gurdy with a face" style="display:block;border:0;width:180px;height:auto;margin:0 0 18px -6px;">

<p style="margin:0 0 6px;font-family:${SANS};font-size:15px;font-weight:800;letter-spacing:0.12em;color:${INDIGO};text-transform:uppercase;">Gurdy</p>

<h1 style="margin:0 0 12px;font-family:${SANS};font-size:38px;line-height:1.05;font-weight:800;letter-spacing:-0.04em;color:${INDIGO};">Sign in with a link</h1>

<p style="margin:0 0 26px;font-family:${SANS};font-size:16px;line-height:1.5;color:${MUTED};">One press and you are in. The link expires, and it works once.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="${INDIGO}" style="border-radius:35px;">
<a href="${safeUrl}" style="display:inline-block;padding:15px 38px;border-radius:35px;background:${INDIGO};border:2px solid ${INDIGO_DEEP};font-family:${SANS};font-size:16px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;">Sign in to ${escapeHtml(host)}</a>
</td></tr>
</table>

<p style="margin:26px 0 8px;font-family:${SANS};font-size:13px;color:${MUTED};">If the button does nothing, paste this into your browser.</p>
<p style="margin:0;padding:12px 14px;background:${PERIWINKLE};border-radius:14px;font-family:${MONO};font-size:12px;line-height:1.5;color:${INDIGO};word-break:break-all;">${safeUrl}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
<tr><td style="border-top:1px solid ${LINE};padding-top:16px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">Someone asked for a sign-in link for <strong style="color:${INK};">${safeEmail}</strong>. If that was not you, do nothing. No one is signed in until this link is opened.</p>
<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">Gurdy keeps a signed record of what your agents did. <span style="color:${MINT};font-weight:800;">&#9834;</span></p>
</td></tr>
</table>

</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;

  const text = [
    "GURDY",
    "",
    "Sign in with a link",
    "",
    "One press and you are in. The link expires, and it works once.",
    "",
    url,
    "",
    `Someone asked for a sign-in link for ${email}. If that was not you, do`,
    "nothing. No one is signed in until this link is opened.",
  ].join("\n");

  return { subject: `Sign in to ${host}`, html, text };
}
