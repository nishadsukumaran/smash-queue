"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Shuttle } from "@/components/Shuttle";
import { buzz } from "@/lib/haptics";

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingLabel,
  disabled,
  title,
  haptic = "tap",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  disabled?: boolean;
  title?: string;
  haptic?: "tap" | "confirm" | "win" | "error" | "none";
  /** Lets one form carry two decisions, e.g. approve and decline. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      // The shimmer keeps sweeping while the server action is in flight, so a
      // slow connection still looks like something is happening.
      className={`${className}${pending ? " btn-working" : ""}`}
      disabled={pending || disabled}
      title={title}
      name={name}
      value={value}
      onClick={() => haptic !== "none" && buzz(haptic)}
    >
      {pending ? (
        <>
          <span className="shuttle-spin inline-flex">
            <Shuttle size={14} />
          </span>
          {pendingLabel ?? "Working..."}
        </>
      ) : (
        children
      )}
    </button>
  );
}
