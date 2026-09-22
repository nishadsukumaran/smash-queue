import localFont from "next/font/local";

/** The wordmark face (Bricolage Grotesque 800, SIL OFL 1.1). Only the logo uses it. */
export const brandFont = localFont({
  src: "./BricolageGrotesque-800.woff2",
  weight: "800",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
