"use client";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import type { ReplayResponse } from "@/lib/client/types";
import { DEFAULT_PRODUCT as P } from "@/lib/engine/product";
import { MONEY, PERIL_COLOR, sgd } from "@/components/ui";

const SEV = ["Fair", "Showers", "Thundery showers", "Heavy thundery showers"];

/** Four frames that tell the day's story in the order it happened */
export function Storyboard({ r, revealed }: { r: ReplayResponse; revealed: number }) {
  const s = r.summary;
  const t1 = r.thresholds.rain[0];
  const t2 = r.thresholds.rain[1];
  const fcRegions = r.forecast ? Object.entries(r.forecast.sev).filter(([, v]) => v >= P.prepPay.minSeverity).map(([k]) => k) : [];
  const total = s.centresPaid + s.close + s.clear + s.capped;
  const paidAmts = r.centres.filter((c) => c.status === "paid").map((c) => c.payout);
  const range = paidAmts.length ? (Math.min(...paidAmts) === Math.max(...paidAmts) ? sgd(paidAmts[0]) : `${sgd(Math.min(...paidAmts))}–${sgd(Math.max(...paidAmts))}`) : null;
  return (
    <div className="sheet mt-5 grid md:grid-cols-4" data-tour="storyboard">
      <Frame n="1" title="The evening before" sub="NEA 24-hour forecast, ~6pm">
        {r.forecast ? (
          <>
            <div className="sign-soft text-[26px]">&ldquo;{r.forecast.general}&rdquo;</div>
            <div className="mt-2 text-[12.5px] text-ink-2">
              High {r.forecast.high ?? "—"}°C ·{" "}
              {fcRegions.length ? (
                <span className="text-plate">Prep Pay sent to {fcRegions.join(", ")}</span>
              ) : (
                <span>
                  no region reached &ldquo;{SEV[P.prepPay.minSeverity].toLowerCase()}&rdquo; — no advance
                </span>
              )}
            </div>
            <div className="caps mt-2 text-ink-3">{r.forecast.source}</div>
          </>
        ) : (
          <div className="text-[13px] text-ink-3">No archived evening forecast for this day.</div>
        )}
      </Frame>

      <Frame n="2" title="The rain field" sub={`${s.gaugesReporting} MSS gauges reported`}>
        <Histogram r={r} />
        <div className="mt-1 text-[12.5px] text-ink-2">
          <b className="text-ink">{s.gaugesOverT1}</b> gauge{s.gaugesOverT1 === 1 ? "" : "s"} passed {t1} mm in an hour
          {s.wettest[0]?.r60 ? (
            <>
              ; wettest <span className="mono">{s.wettest[0].id}</span> {s.wettest[0].name} at <b className="mono">{s.wettest[0].r60} mm</b>
            </>
          ) : null}
          . Haze peaked at PSI <b className="mono">{s.maxPsi || "—"}</b>.
        </div>
      </Frame>

      <Frame n="3" title="Settlement" sub="each centre on its own gauge">
        <div className="sign text-[54px]" style={{ color: MONEY }}>
          {revealed}
          <span className="text-[22px] text-ink-3">/{total}</span>
        </div>
        <div className="text-[12.5px] text-ink-2">
          centres paid · {s.stallsPaid.toLocaleString()} stalls{range ? <> · each insured stall received <b className="mono text-ink">{range}</b></> : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(s.byPeril).map(([k, v]) => (
            <span key={k} className="mono px-1.5 text-[11px]" style={{ background: `${PERIL_COLOR[k as "rain"]}18`, color: PERIL_COLOR[k as "rain"] }}>
              {k} {v}
            </span>
          ))}
          {s.forewarned > 0 && <span className="mono bg-plate-2 px-1.5 text-[11px] text-plate">{s.forewarned} forewarned</span>}
        </div>
      </Frame>

      <Frame n="4" title="Why the others weren't" sub="the honest part" last>
        <Bar segs={[
          { k: "paid", v: s.centresPaid, c: MONEY },
          { k: "close", v: s.close, c: "#d2480f" },
          { k: "capped", v: s.capped, c: "#868170" },
          { k: "below", v: s.clear, c: "#16150f" },
        ]} total={total} />
        <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink-2">
          <li><b className="text-heat">{s.close}</b> came close — their gauge hit ≥ {Math.round(t1 * 0.7)} mm but not {t1}</li>
          <li><b className="text-ink">{s.clear}</b> stayed below every level at their own gauge</li>
          {s.capped > 0 && <li><b>{s.capped}</b> reached a level but had used this year&apos;s cap</li>}
          <li className="text-ink-3">Level 2 ({t2} mm) pays double; storms are local, so neighbours differ.</li>
        </ul>
      </Frame>
    </div>
  );
}

function Frame({ n, title, sub, children, last }: { n: string; title: string; sub: string; children: React.ReactNode; last?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Number(n) * 0.12 }}
      className={`p-4 ${last ? "" : "border-b md:border-b-0 md:border-r"} border-[var(--rule-2)]`}
    >
      <div className="flex items-center gap-2">
        <span className="plate !py-0.5 !text-[10px]">FRAME {n}</span>
        <span className="text-[13.5px] font-semibold">{title}</span>
      </div>
      <div className="caps mb-3 mt-1 text-ink-3">{sub}</div>
      {children}
    </motion.div>
  );
}

function Histogram({ r }: { r: ReplayResponse }) {
  const W = 260;
  const H = 70;
  const vals = r.gauges.map((g) => g.r60).filter((v): v is number => v !== null);
  const maxV = Math.max(r.thresholds.rain[1] * 1.15, ...vals, 10);
  const bins = 24;
  const counts = new Array(bins).fill(0);
  for (const v of vals) counts[Math.min(bins - 1, Math.floor((v / maxV) * bins))]++;
  const y = scaleLinear().domain([0, Math.max(1, ...counts)]).range([H, 4]);
  const bw = W / bins;
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full">
      {counts.map((c, i) => {
        const lo = (i / bins) * maxV;
        const over = lo >= r.thresholds.rain[0];
        return (
          <motion.rect key={i} x={i * bw + 1} width={bw - 2} initial={{ y: H, height: 0 }} animate={{ y: y(c), height: H - y(c) }} transition={{ delay: i * 0.02 }} fill={over ? "#1d5fd1" : "#b9c9e8"} />
        );
      })}
      {r.thresholds.rain.map((t, i) => (
        <g key={i}>
          <line x1={(t / maxV) * W} x2={(t / maxV) * W} y1={0} y2={H} stroke="#16150f" strokeDasharray="3 2" />
          <text x={(t / maxV) * W + 2} y={9} fontSize="8.5" fill="#16150f" fontFamily="var(--font-plex-mono)">
            L{i + 1} {t}mm
          </text>
        </g>
      ))}
      <line x1={0} x2={W} y1={H} y2={H} stroke="#16150f" />
      <text x={0} y={H + 10} fontSize="8" fill="#868170" fontFamily="var(--font-plex-mono)">0</text>
      <text x={W} y={H + 10} fontSize="8" fill="#868170" textAnchor="end" fontFamily="var(--font-plex-mono)">{Math.round(maxV)} mm</text>
    </svg>
  );
}

function Bar({ segs, total }: { segs: { k: string; v: number; c: string }[]; total: number }) {
  return (
    <div>
      <div className="flex h-4 overflow-hidden border border-ink">
        {segs.map((s) => (
          <motion.div key={s.k} initial={{ width: 0 }} animate={{ width: `${(s.v / Math.max(1, total)) * 100}%` }} transition={{ duration: 0.8 }} style={{ background: s.c }} title={`${s.k} ${s.v}`} />
        ))}
      </div>
      <div className="mono mt-1 flex justify-between text-[10px] text-ink-3">
        {segs.map((s) => (
          <span key={s.k}>
            {s.k} {s.v}
          </span>
        ))}
      </div>
    </div>
  );
}
