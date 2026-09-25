/**
 * Night Court + Volt, for the places CSS cannot reach.
 *
 * The interface itself is themed by the `@theme` block in
 * src/app/globals.css. This file exists because a handful of surfaces are
 * rendered outside the stylesheet entirely — a QR code drawn as SVG, an email
 * that has to inline every colour, confetti painted on a canvas, the avatar
 * default stored in the database. Those used to carry their own hexes, which
 * is how the old green survived in five places after the theme moved on.
 *
 * Keep this and the `@theme` block in step. They are the same palette written
 * twice because two languages need it, not two palettes.
 */

export const PALETTE = {
  /** Page ground, darker than the brand's Night Court so cards sit on it. */
  ink: "#080D1A",
  /** Inset wells: inputs, track behind a bar. */
  court: "#0C1424",
  /** Brand: Night Court. Card surfaces. */
  surface: "#101A2E",
  surface2: "#19263F",
  line: "#2A3A5C",
  /** Brand: Volt. The primary accent — the shuttle, the Q, every CTA. */
  volt: "#C8F031",
  voltDim: "#A9DB1E",
  /** The second accent. Cyan rather than the old mint green. */
  cyan: "#22E0D5",
  amber: "#FFB020",
  rose: "#FF4D6D",
  /** Brand: Chalk. */
  chalk: "#F5F3EC",
  muted: "#8496B8",
  /** Ink laid on top of a Volt or cyan fill. */
  onAccent: "#0A1120",
} as const;

/**
 * Avatar colours, in the order they are assigned.
 *
 * Every one of these is checked against --color-surface (#101A2E) rather than
 * against white: a palette that looks lively on a light background turns to
 * mud on a navy one, and the avatars are the only place the app shows more
 * than four hues at once.
 */
export const PLAYER_COLORS = [
  "#22E0D5", // cyan
  "#C8F031", // volt
  "#FFB020", // amber
  "#FF4D6D", // rose
  "#5AC8FF", // sky
  "#B388FF", // violet
  "#4BE38A", // mint
  "#FFD166", // gold
  "#FF8A5B", // coral
  "#8AA4FF", // periwinkle
] as const;

/** Confetti: the accents plus Chalk, so the burst is the brand, not a rainbow. */
export const CONFETTI_COLORS = [
  PALETTE.volt,
  PALETTE.cyan,
  PALETTE.amber,
  PALETTE.chalk,
  "#5AC8FF",
] as const;
