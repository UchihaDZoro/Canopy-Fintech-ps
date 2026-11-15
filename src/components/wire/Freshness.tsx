"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** "Updated 12s ago · next check in 18s" — makes the polling cadence visible */
export function Freshness({ at, everyMs, loading, source }: { at: number | null; everyMs: number; loading: boolean; source?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const ago = at ? Math.max(0, Math.round((now - at) / 1000)) : null;
  const next = at ? Math.max(0, Math.round((at + everyMs - now) / 1000)) : null;
  const p = at ? Math.min(1, (now - at) / everyMs) : 0;
  return (
    <div className="mono flex items-center gap-3 border-2 border-ink bg-card px-3 py-1.5 text-[11.5px]">
      <span className={`h-2 w-2 rounded-full ${loading ? "blink bg-marigold" : "bg-plate"}`} />
      <span className="text-ink">{loading ? "checking NEA…" : ago === null ? "connecting…" : `checked ${ago}s ago`}</span>
      {source && <span className="hidden text-ink-3 sm:inline">· readings at {source}</span>}
      <span className="relative h-1 w-16 bg-paper-3">
        <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${p * 100}%` }} />
      </span>
      <span className="text-ink-3">{next === null ? "" : `next ${next}s`}</span>
    </div>
  );
}

/** Briefly highlights a value whenever it changes */
export function Flash({ value, children, className = "" }: { value: string | number; children: React.ReactNode; className?: string }) {
  const first = useRef(true);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setK((x) => x + 1);
  }, [value]);
  return (
    <span className={`relative inline-block ${className}`}>
      <AnimatePresence>
        {k > 0 && (
          <motion.span
            key={k}
            className="pointer-events-none absolute -inset-1 bg-marigold"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          />
        )}
      </AnimatePresence>
      <span className="relative">{children}</span>
    </span>
  );
}
