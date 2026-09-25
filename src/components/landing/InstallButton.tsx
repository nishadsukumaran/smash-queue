"use client";

import { useEffect, useState } from "react";
import { buzz } from "@/lib/haptics";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Add to home screen", shown only when the browser says it is possible.
 *
 * Chrome and Edge fire `beforeinstallprompt` and let the page trigger the
 * sheet; Safari does not, and iOS installs happen through the Share menu
 * instead. So this renders nothing at all unless the event has fired, rather
 * than offering a button that would do nothing on the platform where most of
 * these players are. Already-installed windows never see it either.
 */
export function InstallButton({ className = "btn btn-ghost" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        buzz("tap");
        await prompt.prompt();
        await prompt.userChoice;
        // The event is single-use: once shown, it cannot be shown again.
        setPrompt(null);
      }}
    >
      Add to home screen
    </button>
  );
}
