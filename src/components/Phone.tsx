"use client";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

export interface PhoneNote {
  id: string;
  app?: string;
  title: string;
  body: ReactNode;
  time: string;
  accent?: string;
  amount?: string;
}

export function Phone({ notes, header, className = "" }: { notes: PhoneNote[]; header?: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-[300px] ${className}`}>
      <div className="relative rounded-[46px] border border-white/15 bg-gradient-to-b from-[#0d1520] to-[#060a10] p-3 shadow-[0_40px_120px_-30px_rgba(52,211,153,0.35),inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="relative h-[600px] overflow-hidden rounded-[36px] bg-[radial-gradient(120%_80%_at_50%_0%,#0f2a2a_0%,#05080d_60%)]">
          <div className="absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-medium text-white/80">
            <span>{new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            <span className="flex gap-1">
              <i className="h-2 w-3 rounded-sm bg-white/70" />
              <i className="h-2 w-4 rounded-sm bg-white/70" />
            </span>
          </div>
          <div className="px-4 pt-10">{header}</div>
          <div className="space-y-2.5 px-3 pt-3">
            <AnimatePresence initial={false}>
              {notes.map((n) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: -24, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-xl"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/50">
                    <span className="flex items-center gap-1.5">
                      <i className="inline-block h-3.5 w-3.5 rounded-[4px]" style={{ background: n.accent ?? "#34d399" }} />
                      {n.app ?? "Daycover+ · Income"}
                    </span>
                    <span>{n.time}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] font-semibold leading-snug text-white">{n.title}</div>
                    {n.amount && (
                      <div className="font-mono text-[13px] font-semibold" style={{ color: n.accent ?? "#34d399" }}>
                        {n.amount}
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-white/70">{n.body}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
