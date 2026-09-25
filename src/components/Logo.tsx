/**
 * The SmashQ "Shuttle Q" mark: a Q whose tail is a shuttlecock.
 * Geometry and colours are the brand kit's (docs/brand); change them there
 * first. The shuttle is outlined in the colour of whatever it sits on, so
 * pass `knock` when the mark isn't on the app's dark ground.
 */
export const BRAND = {
  night: "#101A2E",
  volt: "#C8F031",
  chalk: "#F5F3EC",
} as const;

type Palette = { ring: string; body: string; cap: string; knock: string };

export const MARK_ON_DARK = (knock = "#080D1A"): Palette => ({
  ring: BRAND.chalk, body: BRAND.volt, cap: BRAND.volt, knock,
});

export function MarkPaths({ ring, body, cap, knock }: Palette) {
  return (
    <>
      <circle cx="90" cy="90" r="60" fill="none" stroke={ring} strokeWidth="24" />
      <g transform="translate(124 124) rotate(45) scale(1.15)">
        <g stroke={knock} strokeWidth="8" strokeLinejoin="round" fill={knock}>
          <path d="M0,-22 L38,-8 L38,8 L0,22 Z" />
          <path d="M41,-9 L46,-9 A9,9 0 0 1 46,9 L41,9 Z" />
        </g>
        <path d="M0,-22 L38,-8 L38,8 L0,22 Z" fill={body} />
        <path d="M4,-8 L36,-3 M4,8 L36,3" stroke={knock} strokeWidth="2.6" fill="none" />
        <path d="M41,-9 L46,-9 A9,9 0 0 1 46,9 L41,9 Z" fill={cap} />
      </g>
    </>
  );
}

/** The mark alone, cropped tight, for the app header and anywhere small. */
export function LogoMark({
  size = 28,
  knock,
  className = "",
  /**
   * Announced as "SmashQ" by default, which is right in the header and wrong
   * everywhere else: the mark now also decorates a check-in screen and a win
   * banner, where a screen reader reading the product name a third time adds
   * nothing. Pass null in those places.
   */
  label = "SmashQ",
}: {
  size?: number;
  knock?: string;
  className?: string;
  label?: string | null;
}) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true };
  return (
    <svg width={size} height={size} viewBox="10 10 166 166" className={className} {...a11y}>
      <MarkPaths {...MARK_ON_DARK(knock)} />
    </svg>
  );
}

/**
 * The brand's own shuttlecock, lifted out of the mark and set on its own.
 *
 * The mark is a Q and belongs where the app is signing its name — a hero, a
 * celebration, an empty state. It is the wrong thing to have tumbling through
 * the air or spinning inside a button, which is what the app needs a good deal
 * more often. So this is the same silhouette as the shuttle in the Q's tail,
 * drawn in one colour: the cork leads, the skirt flares behind it, and the two
 * feather lines are the mark's, not a generic fan of strokes.
 *
 * Monochrome on purpose. It inherits `currentColor`, so a caller sets the
 * colour with a text class the way it always has, and the shape stays legible
 * at 14px in a button and at 60px on a check-in screen.
 */
export function BrandShuttle({
  size = 24,
  /** Degrees clockwise. 0 flies to the right; 90 drops cork-first. */
  angle = 0,
  className = "",
}: {
  size?: number;
  angle?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-5 -26 56 52"
      fill="none"
      className={className}
      aria-hidden
    >
      <g transform={`rotate(${angle} 23 0)`}>
        {/* The skirt, wide end trailing. */}
        <path d="M0,-22 L38,-8 L38,8 L0,22 Z" fill="currentColor" opacity=".34" />
        <path d="M0,-22 L38,-8 M0,22 L38,8" stroke="currentColor" strokeWidth="2.4" opacity=".55" />
        {/* The mark's two feather lines, kept at the mark's proportions. */}
        <path d="M4,-8 L36,-3 M4,8 L36,3" stroke="currentColor" strokeWidth="2.6" opacity=".5" />
        {/* The cork. */}
        <path d="M41,-9 L46,-9 A9,9 0 0 1 46,9 L41,9 Z" fill="currentColor" />
        <path d="M38,-8 L38,8" stroke="currentColor" strokeWidth="3" opacity=".8" />
      </g>
    </svg>
  );
}
