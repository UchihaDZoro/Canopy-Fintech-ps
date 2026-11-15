"use client";
import { useEffect } from "react";
import { fetchJson } from "@/lib/client/api";

// Warm the shared data once the browser is idle, so every page opens with its data ready.
// fetchJson memoises in-memory, so pages that ask for the same thing get it instantly.
export function Prefetch() {
  useEffect(() => {
    const go = () => {
      fetchJson("/api/meta").catch(() => {});
      fetchJson("/api/portfolio", {}).catch(() => {});
      fetchJson("/api/notify").catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2500 });
    else setTimeout(go, 1200);
  }, []);
  return null;
}
