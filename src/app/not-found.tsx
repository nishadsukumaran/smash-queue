import Link from "next/link";
import { Shuttle } from "@/components/Shuttle";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

export default function NotFound() {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto w-fit text-shuttle/60">
        <Shuttle size={44} />
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
