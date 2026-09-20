import "server-only";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";

/**
 * Outbound email, currently one message: the sign-in link.
 *
 * Resend when RESEND_API_KEY is set. Without it, the link is printed to the
 * server log instead of failing — so a fresh clone can be signed into before
 * anyone has configured a mail provider, and a missing key never locks the
 * organizer out of their own app. The log line is loud about which mode it is
 * in, because silently not sending mail in production would be worse than an
 * error.
 */

const FROM = process.env.MAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`;

export type SendResult = { delivered: boolean; fallbackLink?: string };

export async function sendMagicLink(to: string, link: string, name: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.warn(
      `\n[mail] RESEND_API_KEY is not set, so no email was sent.\n` +
        `[mail] Sign-in link for ${to}:\n${link}\n`,
    );
    return { delivered: false, fallbackLink: link };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `Sign in to ${APP_NAME}`,
      text: plain(link, name),
      html: html(link, name),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[mail] Resend rejected the send (${res.status}): ${detail}`);
    throw new Error("Could not send the sign-in email.");
  }

  return { delivered: true };
}

function plain(link: string, name: string) {
  return [
    `Hi ${name},`,
    ``,
    `Here is your sign-in link for ${APP_NAME}:`,
    link,
    ``,
    `It works once and expires in 15 minutes.`,
    `If you did not ask for it, you can ignore this — nobody can sign in without the link.`,
    ``,
    `Questions: ${SUPPORT_EMAIL}`,
  ].join("\n");
}

function html(link: string, name: string) {
  // Deliberately plain: inline styles only, no external CSS or images, so it
  // renders the same in Gmail, Outlook and a phone's default client.
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F241D">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#5c7a6f">${APP_NAME}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Hi ${escapeHtml(name)}, here's your sign-in link</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3c554c">It works once and expires in 15 minutes.</p>
    <a href="${link}" style="display:inline-block;background:#0F241D;color:#D7F75B;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px">Sign in</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b8378">Or paste this into your browser:<br><span style="word-break:break-all;color:#3c554c">${link}</span></p>
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e3e9e6;font-size:13px;line-height:1.6;color:#6b8378">Didn't ask for this? Ignore it — nobody can sign in without the link. Questions: <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f7a5c">${SUPPORT_EMAIL}</a></p>
  </div>
</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
