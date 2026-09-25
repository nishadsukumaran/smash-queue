# SmashQ brand kit

The **Shuttle Q** mark: a Q whose tail is a shuttlecock. Chosen September 2026.

| File | Use |
| :--- | :--- |
| `smashq-app-icon.svg`, `smashq-app-icon-1024.png` | App icon, avatars, anywhere square |
| `smashq-mark-dark.svg` | Mark on dark backgrounds (the app's own) |
| `smashq-mark-light.svg` | Mark on Chalk or white |
| `smashq-mark-volt.svg` | Mark on a Volt background |
| `smashq-mark-mono.svg` | One-colour print, stamps, embossing |
| `smashq-lockup-dark.svg/.png`, `smashq-lockup-light.svg/.png` | Mark plus wordmark, on their background |
| `smashq-lockup-*-transparent.svg` | Same, no background |

The wordmark in the lockups is outlined, so the SVGs render the same everywhere without the font.

## Colours

| Name | Hex | Role |
| :--- | :--- | :--- |
| Night Court | `#101A2E` | Icon tile, the mark's ground |
| Volt | `#C8F031` | The shuttle, the Q in "SmashQ" |
| Chalk | `#F5F3EC` | The ring on dark, light backgrounds |

The app's interface is built from these three: Night Court is the card surface, Volt is every accent, Chalk is the type. The full interface palette — the darker page ground either side of Night Court, and the cyan, amber and rose used for state — lives in `src/app/globals.css` (`@theme`) and is mirrored in `src/lib/palette.ts` for the QR code, the sign-in emails and the confetti, which are drawn outside the stylesheet.

## Type

Wordmark: **Bricolage Grotesque ExtraBold (800)**, tracking −3.5%, "Smash" in Chalk (or Night Court on light) and "Q" in Volt.
The font is SIL Open Font License 1.1 (`BricolageGrotesque-OFL.txt`); the app ships it from `src/fonts/` and uses it for the wordmark only.

## Rules

- The shuttle is outlined in the colour of whatever it sits on. On a new background, change that outline (`knock` in `src/components/Logo.tsx`) rather than dropping it.
- Keep clear space of at least the ring's thickness around the mark.
- Don't recolour the mark outside these four variants, rotate it, or set the wordmark in another face.
