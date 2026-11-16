"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

let last: { path: string; at: number } | null = null;

/** Tells the server which page was opened, for the super-admin Activity page. */
export function ActivityBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const now = Date.now();
    // Skip repeats of the same page within a few seconds (re-renders, dev double effects).
    if (last && last.path === pathname && now - last.at < 5000) return;
    last = { path: pathname, at: now };
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
