import type { CSSProperties } from "react";

/**
 * A line of poster type, split so each word can arrive on its own.
 *
 * The split happens on the server and ships as plain spans — there is no
 * measuring, no layout read, no JavaScript. Whitespace is preserved on each
 * span so the words still break and wrap exactly as the original string did.
 */
export function Words({
  children,
  className = "",
  accentFrom,
}: {
  children: string;
  className?: string;
  /** Word index from which the line switches to the accent colour. */
  accentFrom?: number;
}) {
  const words = children.split(" ");
  return (
    <span className={`words ${className}`}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          style={{ "--i": i } as CSSProperties}
          className={accentFrom !== undefined && i >= accentFrom ? "text-shuttle" : undefined}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
