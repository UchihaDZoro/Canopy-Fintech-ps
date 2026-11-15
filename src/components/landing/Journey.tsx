"use client";
import { motion } from "motion/react";
import { DEFAULT_PRODUCT as P } from "@/lib/engine/product";

// The life of one payout, drawn as ink line-art. Times are the engine's actual cadence:
// MSS gauges report every 5 min; settlement runs on each new reading; PayNow is instant.
const t1 = P.perils.rain.tiers[0];
const NODES = [
  { k: "sky", t: "15:00", title: "Storm over Tampines", d: "Rain falls; nothing for the stallholder to do." },
  { k: "gauge", t: "15:05", title: "MSS gauge reports", d: `Wettest hour passes ${t1.threshold} mm at the stall's own gauge.` },
  { k: "engine", t: "15:05", title: "Engine settles", d: "Levels → one peril → caps → advance netting. Receipt printed." },
  { k: "paynow", t: "15:06", title: "PayNow transfer", d: `${"S$" + Math.round(t1.payoutPct * P.insuredDailyIncome)} to the stallholder's phone number.` },
  { k: "phone", t: "15:06", title: "SMS in their language", d: "What was paid, why, and the receipt reference." },
];

function Icon({ k }: { k: string }) {
  const s = { stroke: "#16150f", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "sky":
      return (
        <g>
          <path d="M14 30 a10 10 0 0 1 4-19 a13 13 0 0 1 24 3 a8 8 0 0 1 2 16 Z" {...s} fill="#fbf9f3" />
          {[18, 26, 34, 42].map((x, i) => (
            <motion.line key={x} x1={x} x2={x - 3} y1={36} y2={44} {...s} stroke="#1d5fd1" animate={{ y: [0, 6, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
          ))}
        </g>
      );
    case "gauge":
      return (
        <g>
          <path d="M18 12 h20 l-4 8 h-12 Z" {...s} fill="#ebe6d8" />
          <rect x="21" y="20" width="14" height="26" {...s} fill="#fbf9f3" />
          <motion.rect x="22" y={44} width="12" height={1} fill="#1d5fd1" initial={{ y: 44, height: 1 }} animate={{ y: [44, 26, 44], height: [1, 19, 1] }} transition={{ duration: 3.2, repeat: Infinity }} />
          <line x1="19" x2="37" y1="30" y2="30" {...s} stroke="#e9a100" />
          <rect x="16" y="46" width="24" height="4" fill="#16150f" />
        </g>
      );
    case "engine":
      return (
        <g>
          <rect x="10" y="12" width="36" height="32" {...s} fill="#0e1411" />
          <motion.path d="M15 34 l6 -8 l5 5 l7 -11 l8 6" stroke="#8cf5b5" strokeWidth="2" fill="none" animate={{ pathLength: [0, 1] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6 }} />
          <line x1="20" x2="36" y1="48" y2="48" {...s} />
        </g>
      );
    case "paynow":
      return (
        <g>
          <rect x="10" y="16" width="36" height="24" rx="3" {...s} fill="#fbf0d0" />
          <motion.circle cx="28" cy="28" r="7" fill="#e9a100" stroke="#16150f" strokeWidth="2" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ originX: "28px", originY: "28px" }} />
          <text x="28" y="31.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#16150f">$</text>
        </g>
      );
    default:
      return (
        <g>
          <rect x="17" y="8" width="22" height="40" rx="4" {...s} fill="#fbf9f3" />
          <motion.rect x="20" y="17" width="16" height="9" rx="2" fill="#e3efe8" stroke="#0b6e4f" strokeWidth="1.5" animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 3, repeat: Infinity }} />
          <line x1="25" x2="31" y1="43" y2="43" {...s} />
        </g>
      );
  }
}

export function Journey() {
  return (
    <div className="sheet overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-2)] px-5 py-2.5">
        <span className="caps text-ink">Fig. 3 — the life of one payout</span>
        <span className="caps text-ink-3">gauge to phone in about a minute · no claim, no adjuster</span>
      </div>
      <div className="relative px-5 pb-6 pt-8">
        {/* the wire, with a packet travelling along it */}
        <svg className="pointer-events-none absolute left-0 right-0 top-[58px] hidden h-6 w-full md:block" viewBox="0 0 1000 24" preserveAspectRatio="none">
          <line x1="100" x2="900" y1="12" y2="12" stroke="#16150f" strokeWidth="1.5" strokeDasharray="6 6" />
          <motion.circle r="6" cx={100} cy="12" fill="#e9a100" stroke="#16150f" strokeWidth="1.5" initial={{ cx: 100 }} animate={{ cx: [100, 900] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }} />
        </svg>
        <div className="relative grid gap-6 md:grid-cols-5">
          {NODES.map((n, i) => (
            <motion.div
              key={n.k}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="flex flex-col items-center text-center"
            >
              <div className="flex h-[72px] w-[72px] items-center justify-center border-2 border-ink bg-card shadow-[3px_3px_0_var(--ink)]">
                <svg viewBox="0 0 56 56" className="h-14 w-14">
                  <Icon k={n.k} />
                </svg>
              </div>
              <div className="mono mt-3 text-[11px] text-ink-3">{n.t}</div>
              <div className="mt-0.5 text-[14px] font-semibold">{n.title}</div>
              <p className="mt-1 max-w-[200px] text-[12.5px] leading-relaxed text-ink-2">{n.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
