"use client";
import { motion } from "motion/react";
import type { ReplayResponse } from "@/lib/client/types";
import { MONEY, PERIL_COLOR, sgd } from "@/components/ui";

const PERIL_WORD = { rain: "Storm", heat: "Heat", haze: "Haze" } as const;

/** Notable days as cards: what happened and how many stalls were paid */
export function DayCards({
  days,
  value,
  onPick,
  min,
  max,
}: {
  days: { date: string; peril: string | null; policies: number }[];
  value: string | null;
  onPick: (d: string) => void;
  min: string;
  max?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {days.map((d) => {
        const sel = value === d.date;
        const c = PERIL_COLOR[(d.peril as "rain") ?? "rain"];
        return (
          <motion.button
            key={d.date}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(d.date)}
            className={`border-2 p-3 text-left transition-colors ${sel ? "border-ink bg-ink text-paper shadow-[3px_3px_0_var(--marigold)]" : "border-[var(--rule-2)] bg-card hover:border-ink"}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
              <span className="caps" style={{ color: sel ? "#f4f1e8" : c }}>
                {PERIL_WORD[(d.peril as "rain") ?? "rain"]}
              </span>
            </div>
            <div className="mt-1 text-[15px] font-semibold">
              {new Date(d.date + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <div className={`mono text-[11px] ${sel ? "text-paper/70" : "text-ink-3"}`}>{d.policies.toLocaleString()} insured stalls paid</div>
          </motion.button>
        );
      })}
      <label className={`flex flex-col justify-between border-2 border-dashed p-3 ${value && !days.some((d) => d.date === value) ? "border-ink bg-paper-2" : "border-[var(--rule-2)]"}`}>
        <span className="caps text-ink-3">Any other day</span>
        <input
          type="date"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="mt-1 w-full border border-[var(--rule-2)] bg-card px-1.5 py-1 font-mono text-[12px]"
        />
      </label>
    </div>
  );
}

/** One sentence that says what happened, then a reading guide */
export function Verdict({ r, revealed, onReplay, playing }: { r: ReplayResponse; revealed: number; onReplay: () => void; playing: boolean }) {
  const s = r.summary;
  const t1 = r.thresholds.rain[0];
  const amts = r.centres.filter((c) => c.status === "paid").map((c) => c.payout);
  const range = amts.length ? (Math.min(...amts) === Math.max(...amts) ? sgd(amts[0]) : `${sgd(Math.min(...amts))}–${sgd(Math.max(...amts))}`) : null;
  const total = r.centres.length;
  const nice = new Date(r.date + "T00:00:00").toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const main = (() => {
    const peril = Object.entries(s.byPeril).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!s.centresPaid)
      return `${s.gaugesOverT1 ? `${s.gaugesOverT1} gauge${s.gaugesOverT1 > 1 ? "s" : ""} passed ${t1} mm, but` : "No gauge passed a payout level and"} no hawker centre's own gauge reached a level — nothing was paid.`;
    if (peril === "haze") return `The 24-hour PSI reached ${s.maxPsi}, above the haze level, so all ${s.centresPaid} centres in affected regions were paid ${range} per stall — automatically.`;
    if (peril === "heat") return `Heat stress crossed the WBGT level, so ${s.centresPaid} of ${total} centres were paid ${range} per stall.`;
    return `${s.gaugesOverT1} of ${s.gaugesReporting} rain gauges recorded ${t1} mm or more in an hour, so ${s.centresPaid} of ${total} hawker centres were paid ${range} per stall — automatically, no claims.`;
  })();
  const p = s.centresPaid ? revealed / s.centresPaid : 1;
  return (
    <div className="sheet mt-5">
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="caps text-ink-3">{nice}</div>
          <p className="sign-soft mt-2 text-[clamp(1.4rem,2.6vw,2.1rem)] leading-tight">{main}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <button onClick={onReplay} className="flex items-center gap-2 border-2 border-ink bg-marigold px-4 py-2 text-[13px] font-semibold shadow-[3px_3px_0_var(--ink)] active:translate-y-px active:shadow-none">
            {playing ? "Settling…" : "▶ Replay settlement"}
          </button>
          <div className="flex w-56 items-center gap-2">
            <span className="h-1.5 flex-1 bg-paper-3">
              <span className="block h-1.5" style={{ width: `${p * 100}%`, background: MONEY }} />
            </span>
            <span className="mono text-[11px] text-ink-2">
              {revealed}/{s.centresPaid} paid
            </span>
          </div>
        </div>
      </div>
      <div className="grid border-t border-[var(--rule-2)] text-[12.5px] text-ink-2 md:grid-cols-3">
        {[
          ["1", "The story", "Four frames below: what NEA forecast, what the gauges measured, who was paid, and why the rest weren't."],
          ["2", "The map", "Blue bubbles are rain gauges (bigger = wetter hour). Dots are hawker centres; they turn gold as they're paid."],
          ["3", "The receipt", "Click any dot or ledger row to print that stall's settlement — every reading against every level."],
        ].map(([n, t, d], i) => (
          <div key={n} className={`flex gap-3 p-4 ${i ? "border-t md:border-l md:border-t-0" : ""} border-[var(--rule-2)]`}>
            <span className="plate h-fit !px-1.5 !py-0.5 !text-[10px]">{n}</span>
            <span>
              <b className="text-ink">{t}.</b> {d}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
