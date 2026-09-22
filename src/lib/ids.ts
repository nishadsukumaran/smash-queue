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

/**
 * A community's shareable invite code: four characters from a 34-letter
 * alphabet, about 1.3 million codes. Short enough to read out at a venue.
 * What keeps it from being guessed is not its length but the door: a code
 * only resolves for a signed-in account, and wrong codes are capped per
 * account (see community-actions).
 */
export const INVITE_CODE_LENGTH = 4;
export function inviteCode() {
  return sessionCode(INVITE_CODE_LENGTH);
}
