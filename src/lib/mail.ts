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

export async function sendMagicLink(
  to: string,
  link: string,
  code: string,
  name: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.warn(
      `\n[mail] RESEND_API_KEY is not set, so no email was sent.\n` +
        `[mail] Sign-in code for ${to}: ${code}\n` +
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
      text: plain(link, code, name),
      html: html(link, code, name),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[mail] Resend rejected the send (${res.status}): ${detail}`);
    throw new Error("Could not send the sign-in email.");
  }

  return { delivered: true };
}

function plain(link: string, code: string, name: string) {
  return [
    `Hi ${name},`,
    ``,
    `Your ${APP_NAME} sign-in code is:`,
    ``,
    `    ${code}`,
    ``,
    `Type it on the sign-in screen, or open this link instead:`,
    link,
    ``,
    `Either one works, once, and both expire in 15 minutes.`,
    `If you did not ask for this, ignore it — the code is useless without your email address.`,
    ``,
    `Questions: ${SUPPORT_EMAIL}`,
  ].join("\n");
}

function html(link: string, code: string, name: string) {
  // Deliberately plain: inline styles only, no external CSS or images, so it
  // renders the same in Gmail, Outlook and a phone's default client. The code
  // leads because most people open this on the phone they are signing in on,
  // where switching back to the browser beats following a link into whatever
  // in-app browser the mail client decides to use.
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F241D">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#5c7a6f">${APP_NAME}</p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3">Hi ${escapeHtml(name)}, here's your sign-in code</h1>

    <div style="background:#0F241D;border-radius:12px;padding:20px;text-align:center">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7FA396">Enter this code</p>
      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:.22em;color:#D7F75B">${escapeHtml(code)}</p>
    </div>

    <p style="margin:24px 0 12px;font-size:15px;line-height:1.6;color:#3c554c">Or just tap the button — either one works.</p>
    <a href="${link}" style="display:inline-block;background:#0F241D;color:#D7F75B;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px">Sign in</a>

    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b8378">Both expire in 15 minutes and work once. Link not clickable? Paste this:<br><span style="word-break:break-all;color:#3c554c">${link}</span></p>
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e3e9e6;font-size:13px;line-height:1.6;color:#6b8378">Didn't ask for this? Ignore it — the code is useless without your email address. Questions: <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f7a5c">${SUPPORT_EMAIL}</a></p>
  </div>
</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * An invitation to a community.
 *
 * Same fallback as the sign-in link: without a mail provider the link is
 * logged and handed back, so the organizer can paste it into WhatsApp
 * themselves. That is not a degraded mode for this group — it is how most
 * invitations will actually travel.
 */
export async function sendInvite(
  to: string,
  link: string,
  community: string,
  invitedBy: string,
  name?: string | null,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const greeting = name?.trim() ? name.trim().split(" ")[0] : "there";

  if (!key) {
    console.warn(
      `\n[mail] RESEND_API_KEY is not set, so no invitation was sent.\n` +
        `[mail] Invite link for ${to} to join ${community}:\n${link}\n`,
    );
    return { delivered: false, fallbackLink: link };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `${invitedBy} invited you to ${community}`,
      text: [
        `Hi ${greeting},`,
        ``,
        `${invitedBy} has invited you to join ${community} on ${APP_NAME} —`,
        `where the group books sessions, checks in and runs the court queue.`,
        ``,
        `Accept here:`,
        link,
        ``,
        `No password to set. The link expires in 14 days.`,
        ``,
        `Questions: ${SUPPORT_EMAIL}`,
      ].join("\n"),
      html: inviteHtml(link, community, invitedBy, greeting),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[mail] Resend rejected the invitation (${res.status}): ${detail}`);
    // Deliberately not thrown: the invitation row already exists and its link
    // is about to be shown on screen, so a mail outage costs the organizer a
    // copy-and-paste rather than the whole action.
    return { delivered: false, fallbackLink: link };
  }

  return { delivered: true };
}

function inviteHtml(link: string, community: string, invitedBy: string, greeting: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F241D">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#5c7a6f">${APP_NAME}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Hi ${escapeHtml(greeting)}, you're invited to ${escapeHtml(community)}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3c554c">${escapeHtml(invitedBy)} added you to the community. It is where the group posts sessions, takes bookings, runs the court queue and settles the court fee.</p>
    <a href="${link}" style="display:inline-block;background:#0F241D;color:#D7F75B;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px">Accept the invitation</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b8378">No password to set — the link signs you straight in and expires in 14 days. Not clickable? Paste this:<br><span style="word-break:break-all;color:#3c554c">${link}</span></p>
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e3e9e6;font-size:13px;line-height:1.6;color:#6b8378">Not expecting this? Ignore it and nothing happens. Questions: <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f7a5c">${SUPPORT_EMAIL}</a></p>
  </div>
</body></html>`;
}
