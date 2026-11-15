"use client";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { TOUR_STEPS, type TourStep } from "./steps";

type Ctx = { start: () => void; active: boolean; step: number };
const TourCtx = createContext<Ctx>({ start: () => {}, active: false, step: 0 });
export const useTour = () => useContext(TourCtx);

/** Pages listen for these to perform the step's demo action (e.g. open a replay). */
export function useTourAction(name: string, fn: () => void) {
  useEffect(() => {
    const h = () => fn();
    window.addEventListener(`tour:${name}`, h);
    return () => window.removeEventListener(`tour:${name}`, h);
  }, [name, fn]);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const router = useRouter();
  const path = usePathname();
  const step: TourStep | undefined = active ? TOUR_STEPS[i] : undefined;

  const start = useCallback(() => {
    setI(0);
    setActive(true);
  }, []);
  const stop = useCallback(() => setActive(false), []);
  const go = useCallback((n: number) => {
    if (n < 0) return;
    if (n >= TOUR_STEPS.length) return setActive(false);
    setI(n);
  }, []);

  // Route to the step's page
  useEffect(() => {
    if (!step) return;
    if (step.route !== path) router.push(step.route);
  }, [step, path, router]);

  // Fire the step's demo action once its page is showing
  useEffect(() => {
    if (!step?.action || step.route !== path) return;
    const t = setTimeout(() => window.dispatchEvent(new Event(`tour:${step.action}`)), 500);
    return () => clearTimeout(t);
  }, [step, path]);

  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [active, i, go, stop]);

  const value = useMemo(() => ({ start, active, step: i }), [start, active, i]);
  return (
    <TourCtx.Provider value={value}>
      {children}
      <AnimatePresence>{step && step.route === path && <Spotlight key={`spot-${i}`} step={step} index={i} total={TOUR_STEPS.length} onNext={() => go(i + 1)} onBack={() => go(i - 1)} onClose={stop} />}</AnimatePresence>
    </TourCtx.Provider>
  );
}

function useTargetRect(selector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    let alive = true;
    let scrolled = false;
    let raf = 0;
    const tick = () => {
      if (!alive) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r0 = el.getBoundingClientRect();
          const top = window.scrollY + r0.top - Math.max(80, (window.innerHeight - Math.min(r0.height, window.innerHeight * 0.6)) / 2.4);
          window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        setRect((prev) => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5 ? prev : r));
      } else setRect(null);
      raf = window.setTimeout(tick, 120) as unknown as number;
    };
    setRect(null);
    tick();
    return () => {
      alive = false;
      clearTimeout(raf);
    };
  }, [selector]);
  return rect;
}

function Spotlight({ step, index, total, onNext, onBack, onClose }: { step: TourStep; index: number; total: number; onNext: () => void; onBack: () => void; onClose: () => void }) {
  const rect = useTargetRect(step.target);
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const card = { w: Math.min(380, vw - 32), h: 230 };
  let left = 16;
  let top = vh - card.h - 24;
  if (rect) {
    const below = rect.bottom + pad + 14;
    const above = rect.top - pad - 14 - card.h;
    const right = rect.right + pad + 16;
    if (step.place === "right" && right + card.w < vw) {
      left = right;
      top = Math.min(Math.max(80, rect.top), vh - card.h - 16);
    } else if (step.place === "left" && rect.left - pad - 16 - card.w > 0) {
      left = rect.left - pad - 16 - card.w;
      top = Math.min(Math.max(80, rect.top), vh - card.h - 16);
    } else if (below + card.h < vh) {
      top = below;
      left = Math.min(Math.max(16, rect.left), vw - card.w - 16);
    } else if (above > 70) {
      top = above;
      left = Math.min(Math.max(16, rect.left), vw - card.w - 16);
    } else {
      top = Math.max(80, vh - card.h - 24);
      left = Math.min(Math.max(16, rect.right - card.w), vw - card.w - 16);
    }
  }
  return (
    <motion.div className="fixed inset-0 z-[100]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rect ? (
        <div
          className="tour-ring pointer-events-none fixed"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(22,21,15,0.55)]" />
      )}
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, left, top }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed border-2 border-ink bg-card p-5 shadow-[6px_6px_0_var(--ink)]"
        style={{ width: card.w }}
      >
        <div className="flex items-center justify-between">
          <span className="plate">STEP {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}</span>
          <button onClick={onClose} className="caps text-ink-3 hover:text-ink">Esc · close</button>
        </div>
        <div className="sign-soft mt-3 text-[22px]">{step.title}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: total }).map((_, k) => (
              <span key={k} className={`h-1 flex-1 ${k <= index ? "bg-ink" : "bg-paper-3"}`} />
            ))}
          </div>
          <button onClick={onBack} disabled={index === 0} className="border border-ink px-3 py-1.5 text-[12px] disabled:opacity-30">
            Back
          </button>
          <button onClick={onNext} className="border border-ink bg-marigold px-3 py-1.5 text-[12px] font-semibold">
            {index === total - 1 ? "Finish" : "Next →"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
