import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid misreads

export function newId(prefix = "") {
  const raw = randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${raw}` : raw;
}

/** Short, unambiguous, WhatsApp-friendly session code. */
export function sessionCode(length = 6) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
