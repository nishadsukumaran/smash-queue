import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.QR_SECRET ?? "dev-only-qr-secret";

/**
 * Session check-in tokens are signed so a screenshot of last week's QR code
 * cannot be reused, and so nobody can check themselves in from home.
 */
export function signCheckInToken(sessionId: string, issuedAt = Date.now()) {
  const payload = `${sessionId}.${issuedAt}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 16);
  return `${payload}.${sig}`;
}

export function verifyCheckInToken(
  token: string,
  sessionId: string,
  maxAgeMs = 24 * 60 * 60 * 1000,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [sid, issued, sig] = parts;
  if (sid !== sessionId) return false;

  const expected = createHmac("sha256", secret())
    .update(`${sid}.${issued}`)
    .digest("base64url")
    .slice(0, 16);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const age = Date.now() - Number(issued);
  return Number.isFinite(age) && age >= -60_000 && age < maxAgeMs;
}
