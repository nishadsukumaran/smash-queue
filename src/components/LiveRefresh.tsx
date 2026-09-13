"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a live screen current without a websocket. Good enough for a group of
 * thirty; swap for Supabase Realtime when the app moves off SQLite.
 */
export function LiveRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
