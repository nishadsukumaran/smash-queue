import { colorFor, initials } from "@/lib/format";

export function Avatar({
  name,
  size = 34,
  dim = false,
}: {
  name: string;
  size?: number;
  dim?: boolean;
}) {
  const color = colorFor(name);
  return (
    <span
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${color} ${dim ? 14 : 22}%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} ${dim ? 30 : 55}%, transparent)`,
        color,
        fontSize: size * 0.36,
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
