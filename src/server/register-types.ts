/** Shared shape for the self-registration form state (kept out of the
 *  "use server" module, which may only export functions). */
export type RegisterState = {
  ok: boolean;
  message?: string;
  duplicate?: { id: string; name: string };
} | null;
