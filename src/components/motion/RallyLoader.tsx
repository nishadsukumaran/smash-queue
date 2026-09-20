import { Shuttle } from "@/components/Shuttle";

/**
 * The waiting state: two shuttles rallying over a net.
 *
 * Used for route-level loading, so it is a server component with no JavaScript
 * at all — the whole animation is CSS, which means it starts painting before
 * any bundle has been parsed. That is the point of a loading state.
 */
export function RallyLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16">
      <div className="relative h-24 w-40">
        <span
          className="absolute left-1/2 top-1/2 text-shuttle"
          style={{ animation: "rally-left 1.5s cubic-bezier(.4,0,.5,1) infinite" }}
        >
          <Shuttle size={26} />
        </span>
        <span
          className="absolute left-1/2 top-1/2 text-teal"
          style={{ animation: "rally-right 1.5s cubic-bezier(.4,0,.5,1) infinite" }}
        >
          <Shuttle size={20} />
        </span>
        <span className="absolute inset-x-4 top-1/2 h-px bg-line" />
      </div>
      <p className="text-xs uppercase tracking-[.2em] text-muted">{label}</p>
    </div>
  );
}
