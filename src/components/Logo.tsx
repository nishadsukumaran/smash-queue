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

export const MARK_ON_DARK = (knock = "#06100D"): Palette => ({
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
}: {
  size?: number;
  knock?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="10 10 166 166"
      className={className}
      role="img"
      aria-label="SmashQ"
    >
      <MarkPaths {...MARK_ON_DARK(knock)} />
    </svg>
  );
}
