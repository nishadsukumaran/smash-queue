import Link from "next/link";
import { BrandShuttle } from "@/components/Logo";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

export default function NotFound() {
  return (
    <div className="card relative overflow-hidden p-8 text-center">
      {/* The line the shuttle just landed the wrong side of. */}
      <span className="pointer-events-none absolute inset-x-8 top-[4.6rem] h-px bg-line" />
      <div className="shuttle-drop mx-auto w-fit -rotate-12 text-shuttle/60">
        <BrandShuttle size={46} angle={125} />
      </div>
      <h1 className="mt-4 text-xl font-extrabold">Out of bounds</h1>
      <p className="mt-1 text-sm text-muted">That session code does not exist.</p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to sessions
      </Link>
      <p className="mt-5 text-xs text-muted">
        Link should have worked?{" "}
        <a href={supportMailto("Broken session link")} className="text-teal hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}
