/** Kept out of the "use server" module: a server-action file may only export functions. */
export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Carried forward so the code form knows which address to check against. */
  email?: string;
  /** Development only, when no mail provider is configured. Never set in production. */
  devLink?: string;
  devCode?: string;
};

export type CodeState = {
  status: "idle" | "error";
  message?: string;
};

export const SIGN_IN_IDLE: SignInState = { status: "idle" };
export const CODE_IDLE: CodeState = { status: "idle" };

export type PinState = {
  status: "idle" | "error" | "done";
  message?: string;
  /** The phone has been sent back to email sign-in. */
  locked?: boolean;
};

export type WelcomeState = { status: "idle" | "error"; message?: string };

export const PIN_IDLE: PinState = { status: "idle" };
export const WELCOME_IDLE: WelcomeState = { status: "idle" };
