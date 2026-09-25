import { BrandShuttle } from "@/components/Logo";

/**
 * The waiting state: two shuttles rallying over a net.
 *
 * A server component with no JavaScript at all — the whole thing is CSS, so it
 * paints before any bundle has been parsed. That is rather the point of a
 * loading state. The negative margins centre each shuttle on its own axis,
 * because the keyframes own the transform and cannot also be asked to hold a
 * translate(-50%, -50%).
 */
export function RallyLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14">
      <div className="relative h-20 w-40">
        <span className="absolute inset-x-2 top-1/2 h-px bg-line" />
        <span
          className="absolute left-1/2 top-1/2 text-shuttle"
          style={{
            marginLeft: -14,
            marginTop: -14,
            animation: "rally-left 1.5s cubic-bezier(.4,0,.5,1) infinite",
          }}
        >
          <BrandShuttle size={30} />
        </span>
        <span
          className="absolute left-1/2 top-1/2 text-teal"
          style={{
            marginLeft: -11,
            marginTop: -11,
            animation: "rally-right 1.5s cubic-bezier(.4,0,.5,1) infinite",
          }}
        >
          <BrandShuttle size={24} angle={180} />
        </span>
      </div>
      <p className="text-xs uppercase tracking-[.2em] text-muted">{label}</p>
    </div>
  );
}
