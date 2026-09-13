import Image from "next/image";
import { APP_NAME, APP_VERSION, RELEASE_CHANNEL, SUPPORT_EMAIL, VENDOR, supportMailto } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 w-full max-w-5xl px-4 pb-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line/70 pt-6">
        <a
          href={VENDOR.url}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-2.5"
          aria-label={`${VENDOR.name} website`}
        >
          <Image
            src={VENDOR.logo}
            alt={VENDOR.name}
            width={VENDOR.logoWidth}
            height={VENDOR.logoHeight}
            className="h-5 w-auto opacity-85 transition-opacity hover:opacity-100"
          />
          <span className="text-[.7rem] text-muted">Built by {VENDOR.name}</span>
        </a>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[.7rem] text-muted sm:ml-auto">
          <span className="chip">
            {RELEASE_CHANNEL} &middot; {APP_VERSION}
          </span>
          <a href={supportMailto("Support request")} className="truncate hover:text-teal">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
      <p className="sr-only">
        {APP_NAME} {APP_VERSION}, built by {VENDOR.name}. Support: {SUPPORT_EMAIL}.
      </p>
    </footer>
  );
}
