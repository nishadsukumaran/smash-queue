/** Kept out of the "use server" module: a server-action file may only export functions. */
export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Development only, when no mail provider is configured. Never set in production. */
  devLink?: string;
};

export const SIGN_IN_IDLE: SignInState = { status: "idle" };
