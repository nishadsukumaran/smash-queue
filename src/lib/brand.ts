/** Single source of truth for product identity, release channel and support. */

export const APP_NAME = "Smash Queue";
export const APP_VERSION = "1.0.0";
/** null on a stable release; a label like "Beta" or "RC" on a prerelease. */
export const RELEASE_CHANNEL: string | null = null;

export const SUPPORT_EMAIL = "hello@aiops.ae";

export const VENDOR = {
  name: "AIOps",
  url: "https://aiops.ae",
  tagline: "Vendor-independent forward deployed engineering for the GCC",
  /** Knockout variant: reads on the app's dark court background. */
  logo: "/aiops-reverse.png",
  logoWidth: 528,
  logoHeight: 176,
} as const;

export const supportMailto = (subject: string) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${APP_NAME} ${APP_VERSION}] ${subject}`)}`;
