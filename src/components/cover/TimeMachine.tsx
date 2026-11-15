"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BacktestResult } from "@/lib/client/types";
import { PERIL_COLOR, PERIL_LABEL, sgd } from "@/components/ui";

type Day = BacktestResult["days"][number];

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function doy(date: string) {
  return Math.floor((Date.parse(date) - Date.parse(date.slice(0, 4) + "-01-01")) / 864e5);
}

export function TimeMachine({ bt, income, lossThreshold, onDay }: { bt: BacktestResult; income: number; lossThreshold: number; onDay?: (date: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<{ d: Day; x: number; y: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "paid" | "missed">("all");
  const progress = useMotionValue(0);
  const [prog, setProg] = useState(0);

  const years = useMemo(() => [...new Set(bt.days.map((d) => Number(d.date.slice(0, 4))))], [bt]);
  const byYear = useMemo(() => {
    const m = new Map<number, Day[]>();
    for (const d of bt.days) {
      const y = Number(d.date.slice(0, 4));
      const arr = m.get(y) ?? [];
      arr.push(d);
      m.set(y, arr);
    }
    return m;
  }, [bt]);

  const LABEL_W = 44;
  const ROW_H = 24;
  const GAP = 6;
  const plotW = Math.max(200, width - LABEL_W);
  const cellW = plotW / 366;
  const height = years.length * (ROW_H + GAP) + 18;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Replay animation: sweep through the record
  useEffect(() => {
    progress.set(0);
    const c = animate(progress, 1, { duration: 3.2, ease: [0.4, 0, 0.2, 1] });
    const unsub = progress.on("change", (v) => setProg(v));
    return () => {
      c.stop();
      unsub();
    };
  }, [bt, progress]);
  const replay = () => {
    progress.set(0);
    animate(progress, 1, { duration: 3.2, ease: [0.4, 0, 0.2, 1] });
  };

  const cutoffIdx = Math.floor(prog * bt.days.length);
  const cutoffDate = bt.days[Math.min(cutoffIdx, bt.days.length - 1)]?.date ?? "";
  const paidSoFar = useMemo(() => {
    let s = 0;
    for (let i = 0; i < cutoffIdx && i < bt.days.length; i++) s += bt.days[i].payoutPct * income;
    return s;
  }, [cutoffIdx, bt, income]);
  const counter = useMotionValue(0);
  const counterText = useTransform(counter, (v) => sgd(v));
  useEffect(() => {
    counter.set(paidSoFar);
  }, [paidSoFar, counter]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "10px var(--font-geist-mono), monospace";
    MONTHS.forEach((m, i) => {
      ctx.fillStyle = "#868170";
      ctx.fillText(m, LABEL_W + ((i * 30.5 + 12) / 366) * plotW, 10);
    });
    years.forEach((y, row) => {
      const top = 18 + row * (ROW_H + GAP);
      ctx.fillStyle = "#4a473d";
      ctx.fillText(String(y), 4, top + ROW_H / 2 + 3);
      ctx.fillStyle = "rgba(22,21,15,0.045)";
      ctx.fillRect(LABEL_W, top, plotW, ROW_H);
      for (const d of byYear.get(y) ?? []) {
        if (d.date > cutoffDate) break;
        const x = LABEL_W + doy(d.date) * cellW;
        const paid = d.payoutPct > 0 && d.prob >= 0.5;
        const maybe = d.payoutPct > 0 && d.prob < 0.5; // modelled heat: priced by probability
        const missed = d.lossDay && !paid;
        if (filter === "paid" && !paid) continue;
        if (filter === "missed" && !missed) continue;
        if (maybe && d.peril && filter === "all") {
          // Reconstructed heat (before NEA WBGT existed): a small tick, only when the chance is material
          if (d.prob >= 0.2) {
            ctx.fillStyle = PERIL_COLOR[d.peril];
            ctx.globalAlpha = 0.35 + d.prob * 0.6;
            ctx.fillRect(x, top + ROW_H - 5, Math.max(1.6, cellW), 5);
            ctx.globalAlpha = 1;
          }
        } else if (paid && d.peril) {
          const col = PERIL_COLOR[d.peril];
          ctx.fillStyle = col;
          ctx.globalAlpha = d.tier >= 2 ? 1 : 0.75;
          ctx.fillRect(x, top, Math.max(1.6, cellW), ROW_H);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x - 1, top - 2, Math.max(1.6, cellW) + 2, ROW_H + 4);
          ctx.globalAlpha = 1;
        } else if (missed) {
          ctx.fillStyle = "#c0262d";
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, top + ROW_H * 0.3, Math.max(1.4, cellW), ROW_H * 0.7);
          ctx.globalAlpha = 1;
        } else if (filter === "all" && d.rain !== null && d.rain > 0) {
          const a = Math.min(0.5, 0.06 + d.rain / 120);
          ctx.fillStyle = `rgba(29,95,209,${a})`;
          const h = Math.min(ROW_H, 4 + (d.rain / 70) * ROW_H);
          ctx.fillRect(x, top + ROW_H - h, Math.max(1, cellW - 0.2), h);
        }
        if (d.capped) {
          ctx.fillStyle = "#868170";
          ctx.fillRect(x, top + ROW_H - 3, Math.max(1.4, cellW), 3);
        }
        if (d.advance) {
          ctx.fillStyle = "#0b6e4f";
          ctx.beginPath();
          ctx.arc(x + cellW / 2, top - 1.5, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }, [width, height, years, byYear, cellW, plotW, cutoffDate, filter]);

  const onMove = (e: React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const row = Math.floor((y - 18) / (ROW_H + GAP));
    const yr = years[row];
    if (yr === undefined || x < LABEL_W) return setHover(null);
    const day = Math.floor((x - LABEL_W) / cellW);
    const arr = byYear.get(yr) ?? [];
    let best: Day | null = null;
    let bd = 99;
    for (const d of arr) {
      const dd = Math.abs(doy(d.date) - day);
      const score = dd - (d.payoutPct > 0 ? 1.5 : d.lossDay ? 1 : 0);
      if (dd <= 2 && score < bd) {
        bd = score;
        best = d;
      }
    }
    setHover(best ? { d: best, x, y } : null);
  };

  const totals = useMemo(() => {
    const paid = bt.days.filter((d) => d.payoutPct > 0 && d.prob >= 0.5);
    const missed = bt.days.filter((d) => d.lossDay && !(d.payoutPct > 0 && d.prob >= 0.5));
    const expected = bt.days.reduce((a, d) => a + d.payoutPct * income, 0);
    return { paid: paid.length, missed: missed.length, amount: expected, adv: bt.days.filter((d) => d.advance).length };
  }, [bt, income]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-2">Replaying {cutoffDate.slice(0, 7) || "…"}</div>
          <motion.div className="font-mono text-4xl font-semibold tabular-nums text-plate">{counterText}</motion.div>
          <div className="text-xs text-ink-3">expected payouts to you since {bt.period.from.slice(0, 4)}, settled on official readings</div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--rule-2)] p-1 text-xs">
          {(["all", "paid", "missed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 capitalize ${filter === f ? "bg-paper-3 text-ink" : "text-ink-2"}`}>
              {f === "missed" ? "Lost, not paid" : f}
            </button>
          ))}
          <button onClick={replay} className="ml-1 rounded-full bg-plate-2 px-3 py-1 text-plate hover:bg-plate-2">↻ Replay</button>
        </div>
      </div>
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <canvas ref={canvas} onMouseMove={onMove} onClick={() => hover && onDay?.(hover.d.date)} className="block cursor-pointer" />
        {hover && <DayTip d={hover.d} x={hover.x} y={hover.y} width={width} income={income} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-2">
        {(["rain", "heat", "haze"] as const).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: PERIL_COLOR[p] }} /> Paid · {PERIL_LABEL[p].toLowerCase()}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-alert" /> Likely lost ≥{Math.round(lossThreshold * 100)}% of takings, no payout</span>
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-plate" /> Prep Pay advance (forecast)</span>
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-2.5 rounded-sm bg-heat" /> Heat likely (≥20%, reconstructed before 2025)</span>
        <span className="flex items-center gap-1.5"><i className="h-1 w-3 bg-ink-3" /> Over yearly cap</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rain-2" /> Rain (height = mm/hr)</span>
      </div>
      <div className="mt-2 text-[11px] text-ink-3">
        {totals.paid} trigger days · {sgd(totals.amount)} expected paid (incl. probability-weighted heat before NEA WBGT began in Feb 2025) · {totals.missed} likely-loss days with no payout · {totals.adv} forecast advances on sampled days
      </div>
    </div>
  );
}

function DayTip({ d, x, y, width, income }: { d: Day; x: number; y: number; width: number; income: number }) {
  const left = Math.min(Math.max(8, x + 14), width - 250);
  const nice = new Date(d.date + "T00:00:00").toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="sheet pointer-events-none absolute z-10 w-[240px] rounded-sm p-3 text-xs" style={{ left, top: Math.max(0, y - 120) }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold text-ink">{nice}</span>
        {d.payoutPct > 0 && d.prob >= 0.5 ? (
          <span className="font-mono text-marigold">+{sgd(d.payoutPct * income)}</span>
        ) : d.payoutPct > 0 ? (
          <span className="font-mono text-heat">{Math.round(d.prob * 100)}% chance</span>
        ) : d.lossDay ? (
          <span className="text-alert">no payout</span>
        ) : null}
      </div>
      <Row k={`Rain, wettest hour${d.rainStation ? ` · ${d.rainStation}` : ""}`} v={d.rain === null ? "—" : `${d.rain} mm`} c="#38bdf8" />
      <Row k={`WBGT ${d.wbgtSource === "modelled" ? "(modelled)" : d.wbgtSource === "observed" ? "(NEA obs.)" : ""}`} v={d.wbgt === null ? "—" : `${d.wbgt}°C`} c="#d2480f" />
      <Row k="24-h PSI (region)" v={d.psi === null ? "—" : String(d.psi)} c="#6f52a3" />
      <Row k="Modelled drop in takings" v={`${Math.round(d.lossPct * 100)}%`} c={d.lossDay ? "#c0262d" : "#4a473d"} />
      {d.advance && <div className="mt-1.5 text-plate">Prep Pay advance sent the evening before</div>}
      {d.capped && <div className="mt-1.5 text-ink-2">Trigger reached, but the yearly cap was used up</div>}
      {d.payoutPct > 0 && d.peril && d.prob >= 0.5 && (
        <div className="mt-1.5" style={{ color: PERIL_COLOR[d.peril] }}>
          {PERIL_LABEL[d.peril]} · tier {d.tier}
        </div>
      )}
      {d.payoutPct > 0 && d.prob < 0.5 && (
        <div className="mt-1.5 text-heat">
          WBGT reconstructed from MSS temperatures: {Math.round(d.prob * 100)}% chance it reached the heat level · priced at {sgd(d.payoutPct * income, 2)}
        </div>
      )}
    </div>
  );
}
function Row({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-ink-2">{k}</span>
      <span className="font-mono" style={{ color: c }}>{v}</span>
    </div>
  );
}
