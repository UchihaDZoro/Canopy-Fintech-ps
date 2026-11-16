"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/client/api";
import type { DecisionTrace, MetaResponse } from "@/lib/client/types";
import { DEFAULT_PRODUCT } from "@/lib/engine/product";
import { modelledLoss } from "@/lib/engine/loss";
import { MONEY, PERIL_COLOR, PERIL_LABEL, PERIL_TINT, sgd } from "@/components/ui";

const P = DEFAULT_PRODUCT;
type Peril = "rain" | "heat" | "haze";
const RANGE: Record<Peril, [number, number, number]> = { rain: [0, 110, 0.5], heat: [26, 37, 0.1], haze: [0, 340, 1] };
const UNIT: Record<Peril, string> = { rain: "mm in 60 min", heat: "°C WBGT", haze: "24-h PSI" };
const SOURCE: Record<Peril, string> = { rain: "MSS rain gauge nearest the stall", heat: "NEA WBGT station nearest the stall", haze: "NEA 24-h PSI for the region" };

// Real days from the record: values are loaded from the settlement engine, not typed in.
const PRESETS = [
  { id: "storm", label: "Storm", centre: "HC1", date: "2021-04-17" },
  { id: "haze", label: "Haze", centre: "HC2", date: "2015-09-25" },
  { id: "heat", label: "Heat", centre: "HC46", date: "2026-09-15" },
  { id: "before", label: "Day before", centre: "HC1", date: "2021-04-16" },
];

function tierOf(v: number, peril: Peril) {
  let t = 0;
  let amt = 0;
  P.perils[peril].tiers.forEach((x, i) => {
    if (v >= x.threshold) {
      t = i + 1;
      amt = x.payoutPct * P.insuredDailyIncome;
    }
  });
  return { t, amt };
}

export function Rulebook({ meta }: { meta: MetaResponse | null }) {
  const [v, setV] = useState<Record<Peril, number>>({ rain: 38, heat: 31.2, haze: 55 });
  const [forecastHeavy, setForecastHeavy] = useState(true);
  const [used, setUsed] = useState<Record<Peril, number>>({ rain: 1, heat: 0, haze: 0 });
  const [preset, setPreset] = useState<string | null>(null);
  const [src, setSrc] = useState<{ label: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const c = meta?.hawkers.find((h) => h.id === p.centre);
    if (!c) return;
    setPreset(id);
    setLoading(true);
    try {
      const t = await fetchJson<DecisionTrace>("/api/explain", { lat: c.lat, lon: c.lon, label: c.name, date: p.date });
      const get = (k: Peril) => t.perils.find((x) => x.peril === k)?.value;
      setV({ rain: get("rain") ?? 0, heat: get("heat") ?? 28, haze: get("haze") ?? 30 });
      setForecastHeavy(t.prepPay.sent);
      setUsed({ rain: Math.round(t.caps.usedBefore.rain), heat: Math.round(t.caps.usedBefore.heat), haze: Math.round(t.caps.usedBefore.haze) });
      const g = t.gauges.find((x) => x.used);
      setSrc({
        label: `${c.name.replace(/\s*\(.*\)/, "")} · ${new Date(p.date + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}`,
        detail: `${g ? `gauge ${g.id} ${g.km} km` : "no gauge"} · ${t.perils.find((x) => x.peril === "heat")?.source ?? ""}`,
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (meta && !preset) load("storm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const r = useMemo(() => {
    const per = (["rain", "heat", "haze"] as Peril[]).map((k) => ({ k, ...tierOf(v[k], k), open: used[k] < P.perils[k].maxDays }));
    const totalUsed = used.rain + used.heat + used.haze;
    const candidates = per.filter((x) => x.amt > 0 && x.open).sort((a, b) => b.amt - a.amt);
    const triggered = per.filter((x) => x.amt > 0);
    const totalOpen = totalUsed < P.maxPayableDaysPerYear;
    const win = totalOpen ? candidates[0] : undefined;
    const advance = forecastHeavy ? P.prepPay.advancePct * P.insuredDailyIncome : 0;
    const gross = win?.amt ?? 0;
    const deducted = P.prepPay.recoup ? Math.min(advance, gross) : 0;
    const loss = modelledLoss(P.lossModel, v.rain, v.heat, v.haze) * P.insuredDailyIncome;
    return { per, win, triggered, totalUsed, totalOpen, advance, gross, deducted, transfer: gross - deducted, loss, capped: triggered.length > 0 && !win };
  }, [v, used, forecastHeavy]);

  const sentence = r.win
    ? `${PERIL_LABEL[r.win.k]} reached level ${r.win.t} at the official instrument, so Daycover+ pays ${sgd(r.gross)}${r.deducted ? `, less the ${sgd(r.deducted)} advanced last night` : ""}. No claim, no adjuster.`
    : r.capped
      ? "A level was reached, but this year's payable days are used up — the receipt records it and pays nothing."
      : `Nothing reached a printed level, so nothing is paid — even though takings may be down about ${sgd(r.loss)}. That's the honest edge of parametric cover.`;

  return (
    <div className="sheet p-5 md:p-7" data-tour="rulebook">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-ink-3">Interactive rulebook · same rules as the settlement engine</div>
          <div className="sign mt-1 text-[34px] md:text-[44px]">How a payout is decided</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="caps mr-1 text-ink-3">Load a real day:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => load(p.id)}
              className={`border px-2.5 py-1 text-[12px] ${preset === p.id ? "border-ink bg-ink text-paper" : "border-[var(--rule-2)] text-ink-2 hover:border-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mono mt-2 min-h-[18px] text-[11px] text-ink-3">
        {loading ? "loading from the official record…" : src ? `▸ ${src.label} — ${src.detail}` : "▸ move the readings yourself"}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1.25fr_0.95fr]">
        {/* 1 readings */}
        <div>
          <Step n="1" title="Read the instruments" />
          <div className="space-y-5">
            {(["rain", "heat", "haze"] as Peril[]).map((k) => (
              <Instrument key={k} k={k} value={v[k]} onChange={(x) => { setPreset(null); setSrc(null); setV((o) => ({ ...o, [k]: x })); }} />
            ))}
          </div>
        </div>

        {/* 2 levels + 3 highest + 4 caps */}
        <div>
          <Step n="2" title="Compare with the printed levels" />
          <div className="space-y-3">
            {r.per.map((x) => (
              <div key={x.k} className="grid grid-cols-[86px_1fr] items-center gap-2">
                <span className="text-[12.5px] font-semibold" style={{ color: PERIL_COLOR[x.k] }}>
                  {PERIL_LABEL[x.k]}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <Gate active={x.t === 0} color="#868170" tint="#ebe6d8" top={`< ${P.perils[x.k].tiers[0].threshold}`} amt="S$0" />
                  {P.perils[x.k].tiers.map((t, i) => (
                    <Gate
                      key={i}
                      active={x.t === i + 1}
                      dim={x.t > i + 1}
                      color={PERIL_COLOR[x.k]}
                      tint={PERIL_TINT[x.k]}
                      top={`≥ ${t.threshold}`}
                      amt={sgd(t.payoutPct * P.insuredDailyIncome)}
                      winner={r.win?.k === x.k && x.t === i + 1}
                      blocked={x.t === i + 1 && !x.open}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <Step n="3" title="One peril pays" small />
              <p className="text-[12px] leading-relaxed text-ink-2">
                {r.triggered.length > 1 ? `${r.triggered.length} perils triggered — only the highest pays (no stacking).` : r.triggered.length === 1 ? "One peril triggered." : "No peril triggered."}
              </p>
            </div>
            <div>
              <Step n="4" title="Caps this year" small />
              {(["rain", "heat", "haze"] as Peril[]).map((k) => (
                <div key={k} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-9 text-ink-3">{k}</span>
                  <span className="flex flex-1 gap-[2px]">
                    {Array.from({ length: P.perils[k].maxDays }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setUsed((o) => ({ ...o, [k]: o[k] === i + 1 ? i : i + 1 }))}
                        className="h-2.5 flex-1"
                        style={{ background: i < used[k] ? "var(--ink)" : "var(--paper-3)" }}
                        title="click to set days already used"
                      />
                    ))}
                  </span>
                </div>
              ))}
              <div className="mono mt-1 text-[10.5px] text-ink-3">
                {r.totalUsed}/{P.maxPayableDaysPerYear} days used overall
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Step n="5" title="Prep Pay last night" small />
            <button onClick={() => setForecastHeavy((x) => !x)} className="flex w-full items-center gap-2 border border-[var(--rule-2)] px-3 py-2 text-left text-[12px] hover:border-ink">
              <span className={`h-3 w-3 border border-ink ${forecastHeavy ? "bg-plate" : ""}`} />
              NEA forecast &ldquo;heavy thundery showers&rdquo; for the region → {sgd(P.prepPay.advancePct * P.insuredDailyIncome)} sent at 6pm
            </button>
          </div>
        </div>

        {/* result */}
        <div className="flex flex-col">
          <Step n="6" title="Settle" />
          <div className="relative flex-1 border-2 border-ink bg-card p-4">
            <div className="caps text-ink-3">PayNow today</div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={r.transfer}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                className="sign mt-1 text-[64px]"
                style={{ color: r.transfer > 0 ? MONEY : "var(--ink-3)" }}
              >
                {sgd(r.transfer)}
              </motion.div>
            </AnimatePresence>
            {r.deducted > 0 && <div className="mono text-[11px] text-ink-2">{sgd(r.gross)} due − {sgd(r.deducted)} advanced</div>}
            {r.advance > 0 && r.gross === 0 && <div className="mono text-[11px] text-plate">+{sgd(r.advance)} advance already received</div>}
            <div className="mt-3 border-t border-[var(--rule)] pt-3 text-[12.5px] leading-relaxed text-ink-2">{sentence}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--rule)] pt-3">
              <div>
                <div className="caps text-ink-3">likely loss</div>
                <div className="mono text-[15px] font-semibold text-alert">{sgd(r.loss)}</div>
              </div>
              <div>
                <div className="caps text-ink-3">paid</div>
                <div className="mono text-[15px] font-semibold" style={{ color: MONEY }}>
                  {sgd(r.gross)}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[10.5px] text-ink-3">Loss from the transparent revenue-drop model; payouts stay below it so this is insurance, not a bet.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, small }: { n: string; title: string; small?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${small ? "mb-1.5" : "mb-3"}`}>
      <span className="plate !px-1.5 !py-0.5 !text-[10px]">{n}</span>
      <span className={`${small ? "text-[12px]" : "text-[13.5px]"} font-semibold`}>{title}</span>
    </div>
  );
}

function Gate({ active, dim, color, tint, top, amt, winner, blocked }: { active: boolean; dim?: boolean; color: string; tint: string; top: string; amt: string; winner?: boolean; blocked?: boolean }) {
  return (
    <motion.div
      animate={{ backgroundColor: active ? (winner ? color : tint) : dim ? tint : "#fbf9f3", scale: active ? 1.03 : 1 }}
      transition={{ duration: 0.25 }}
      className="relative border px-2 py-1.5"
      style={{ borderColor: active || dim ? color : "var(--rule-2)" }}
    >
      <div className="mono text-[10.5px]" style={{ color: active && winner ? "#fff" : "var(--ink-2)" }}>
        {top}
      </div>
      <div className="mono text-[13px] font-semibold" style={{ color: active && winner ? "#fff" : active || dim ? color : "var(--ink-3)" }}>
        {amt}
      </div>
      {blocked && <span className="caps absolute -top-2 right-1 bg-alert px-1 text-[8.5px] text-white">cap used</span>}
    </motion.div>
  );
}

function Instrument({ k, value, onChange }: { k: Peril; value: number; onChange: (v: number) => void }) {
  const [min, max, step] = RANGE[k];
  const pos = (x: number) => ((x - min) / (max - min)) * 100;
  const color = PERIL_COLOR[k];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold" style={{ color }}>
          {PERIL_LABEL[k]}
        </span>
        <span className="mono text-[20px] font-semibold tabular-nums">
          {value.toFixed(k === "heat" ? 1 : 0)}
          <span className="ml-1 text-[11px] font-normal text-ink-3">{UNIT[k]}</span>
        </span>
      </div>
      {/* ruler */}
      <div className="relative mt-1 h-7">
        <div className="absolute inset-x-0 top-3 h-[6px] bg-paper-3" />
        <motion.div className="absolute left-0 top-3 h-[6px]" style={{ background: color }} animate={{ width: `${pos(value)}%` }} transition={{ duration: 0.2 }} />
        {Array.from({ length: 21 }).map((_, i) => (
          <span key={i} className="absolute top-[22px] w-px bg-ink-3" style={{ left: `${i * 5}%`, height: i % 5 === 0 ? 6 : 3 }} />
        ))}
        {P.perils[k].tiers.map((t, i) => (
          <span key={i} className="absolute top-0 h-[22px] w-[2px] bg-ink" style={{ left: `${pos(t.threshold)}%` }}>
            <span className="mono absolute -top-[2px] left-1 whitespace-nowrap text-[9px] text-ink-2">L{i + 1}</span>
          </span>
        ))}
        <input
          aria-label={PERIL_LABEL[k]}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="text-[10.5px] text-ink-3">{SOURCE[k]}</div>
    </div>
  );
}
