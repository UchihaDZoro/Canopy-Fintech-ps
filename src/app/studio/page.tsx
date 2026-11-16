"use client";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/client/api";
import type { MetaResponse, PortfolioResponse, ProductSpec } from "@/lib/client/types";
import { DEFAULT_PRODUCT } from "@/lib/engine/product";
import { Card, Counter, Eyebrow, PERIL_COLOR, Range, Toggle, Why, pct, sgd } from "@/components/ui";
import { LossRatioChart } from "@/components/charts";
import { MapView, type MapLayerSpec } from "@/components/map/MapView";

type Spec = ProductSpec;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Climate scenarios from Singapore's V3 study, expressed as an annual trend in expected
// payouts (an assumption the actuary sets — shown, not hidden).
const SCENARIOS = [
  { id: "low", label: "V3 low emissions", trend: 0.01 },
  { id: "med", label: "V3 medium", trend: 0.02 },
  { id: "high", label: "V3 high emissions", trend: 0.04 },
];

export default function StudioPage() {
  const [spec, setSpec] = useState<Spec>(() => clone(DEFAULT_PRODUCT));
  const [opts, setOpts] = useState({ takeUp: 0.3, stopLossAttach: 1.2, stopLossLimit: 3 });
  const port = useApi<PortfolioResponse>("/api/portfolio", { product: spec, options: opts }, { debounceMs: 350 });
  const meta = useApi<MetaResponse>("/api/meta");
  const d = port.data;

  const set = (fn: (s: Spec) => void) =>
    setSpec((prev) => {
      const n = clone(prev);
      fn(n);
      return n;
    });

  const weekly = d ? d.totals.premiumIncome / Math.max(1, d.totals.policies) / 52 : 0;
  const layers: MapLayerSpec[] = useMemo(
    () => [
      {
        id: "centres",
        points: (d?.centres ?? []).map((c) => ({
          id: c.id,
          lon: c.lon,
          lat: c.lat,
          props: { z: c.rawZoneFactor, w: c.weeklyPremium, stalls: c.stalls, name: `${c.name} · S$${c.weeklyPremium.toFixed(2)}/wk` },
        })),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "stalls"], 10, 4, 200, 10],
          "circle-color": ["interpolate", ["linear"], ["get", "z"], 0.6, "#a9c9a4", 1, "#e9a100", 1.4, "#d2480f"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#16150f",
          "circle-opacity": 0.92,
        },
        label: { field: "name", minzoom: 12.8 },
        column: { height: ["*", ["get", "w"], 260], radius: 240, opacity: 0.92 },
      },
    ],
    [d]
  );

  return (
    <main className="mx-auto max-w-[1400px] px-5 pb-28 pt-28 md:pt-20">
      <div className="border-b-2 border-ink pb-4">
        <Eyebrow n="05">Actuary studio · for Income</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="sign text-[clamp(2.8rem,6vw,5.6rem)]">Change any rule. Re-price the island.</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
              Every trigger, payout, cap, climate assumption and loading is a control. Each change re-settles {d?.totals.centres ?? 120} hawker centres on
              every day since 2014 and re-prices the pool.
            </p>
          </div>
          <div className="mono flex items-center gap-3 border-2 border-ink bg-card px-3 py-2 text-[11.5px] text-ink-2">
            <span className={`h-2 w-2 rounded-full ${port.loading ? "blink bg-heat" : "bg-plate"}`} />
            {port.loading ? `re-settling 12 yrs × ${d?.totals.centres ?? 120} centres…` : d ? `settled in ${d.ms} ms` : "loading…"}
            <button onClick={() => setSpec(clone(DEFAULT_PRODUCT))} className="border border-ink px-2 py-0.5 hover:bg-paper-2">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[360px_1fr] [&>*]:min-w-0" data-tour="studio">
        {/* ───────── controls ───────── */}
        <Card className="space-y-6 p-5">
          <div className="space-y-6">
            <Section title="Cover">
              <Range label="Insured daily income" value={spec.insuredDailyIncome} min={50} max={400} step={10} format={(v) => sgd(v)} onChange={(v) => set((s) => (s.insuredDailyIncome = v))} />
              <Range label="Max payable days / year" value={spec.maxPayableDaysPerYear} min={2} max={20} step={1} onChange={(v) => set((s) => (s.maxPayableDaysPerYear = v))} />
              <Range label="Gauge search radius" value={spec.stationRadiusKm} min={1} max={10} step={0.5} format={(v) => `${v} km`} onChange={(v) => set((s) => (s.stationRadiusKm = v))} />
            </Section>
            <PerilControls spec={spec} set={set} peril="rain" unit="mm/hr" min={20} max={120} step={5} />
            <PerilControls spec={spec} set={set} peril="heat" unit="°C WBGT" min={30} max={36} step={0.5} />
            <PerilControls spec={spec} set={set} peril="haze" unit="PSI" min={80} max={350} step={10} />
            <Section title="Prep Pay">
              <Toggle checked={spec.prepPay.enabled} onChange={(v) => set((s) => (s.prepPay.enabled = v))} label="Advance on NEA forecast" />
              <Toggle checked={spec.prepPay.recoup} onChange={(v) => set((s) => (s.prepPay.recoup = v))} label="Recover from next payout" />
              <Range label="Max advances / year" value={spec.prepPay.maxPerYear} min={0} max={30} step={1} onChange={(v) => set((s) => (s.prepPay.maxPerYear = v))} />
              <Range label="Advance size" value={spec.prepPay.advancePct} min={0} max={0.3} step={0.01} format={(v) => `${pct(v)} · ${sgd(v * spec.insuredDailyIncome)}`} onChange={(v) => set((s) => (s.prepPay.advancePct = v))} />
              <div className="flex gap-1.5 text-xs">
                {([2, 3] as const).map((sv) => (
                  <button key={sv} onClick={() => set((s) => (s.prepPay.minSeverity = sv))} className={`flex-1 rounded-lg px-2 py-1.5 ${spec.prepPay.minSeverity === sv ? "bg-paper-3 text-ink" : "text-ink-2"}`}>
                    {sv === 2 ? "Thundery showers+" : "Heavy only"}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Loadings & climate">
              <div className="flex gap-1.5 text-[11px]">
                {SCENARIOS.map((sc) => (
                  <button key={sc.id} onClick={() => set((s) => (s.loadings.climateTrend = sc.trend))} className={`flex-1 rounded-lg px-1.5 py-1.5 ${spec.loadings.climateTrend === sc.trend ? "bg-heat-2 text-heat" : "text-ink-2"}`}>
                    {sc.label}
                  </button>
                ))}
              </div>
              <Range label="Climate trend in payouts" value={spec.loadings.climateTrend} min={0} max={0.08} step={0.005} format={(v) => `${(v * 100).toFixed(1)}%/yr`} onChange={(v) => set((s) => (s.loadings.climateTrend = v))} />
              <Range label="Expense ratio" value={spec.loadings.expenseRatio} min={0.1} max={0.35} step={0.01} format={(v) => pct(v)} onChange={(v) => set((s) => (s.loadings.expenseRatio = v))} />
              <Range label="Risk margin" value={spec.loadings.riskMargin} min={0} max={0.2} step={0.01} format={(v) => pct(v)} onChange={(v) => set((s) => (s.loadings.riskMargin = v))} />
              <Range label="Catastrophe load (× σ)" value={spec.loadings.catLoad} min={0} max={1.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set((s) => (s.loadings.catLoad = v))} />
              <Range label="Fairness cap on location pricing" value={spec.loadings.zoneCap} min={0} max={0.6} step={0.05} format={(v) => `±${pct(v)}`} onChange={(v) => set((s) => (s.loadings.zoneCap = v))} />
            </Section>
            <Section title="Portfolio & reinsurance">
              <Range label="Take-up among stallholders" value={opts.takeUp} min={0.05} max={1} step={0.05} format={(v) => pct(v)} onChange={(v) => setOpts((o) => ({ ...o, takeUp: v }))} />
              <Range label="Stop-loss attaches at loss ratio" value={opts.stopLossAttach} min={0.8} max={2.5} step={0.05} format={(v) => pct(v)} onChange={(v) => setOpts((o) => ({ ...o, stopLossAttach: v }))} />
            </Section>
          </div>
        </Card>

        {/* ───────── results ───────── */}
        <div className={`space-y-4 transition-opacity ${port.loading ? "opacity-70" : ""}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Avg premium" value={d ? <Counter key={weekly.toFixed(2)} value={weekly} decimals={2} prefix="S$" duration={0.6} /> : "…"} hint="per stall / week" accent="text-plate" />
            <Kpi label="Loss ratio" value={d ? pct(d.totals.avgLossRatio) : "…"} hint={d ? `σ ${pct(d.totals.sdLossRatio, 1)} year to year` : ""} />
            <Kpi label="Worst year" value={d?.totals.worstYear ? pct(d.totals.worstYear.lossRatio) : "…"} hint={d?.totals.worstYear ? String(d.totals.worstYear.year) : ""} accent={d && d.totals.worstYear?.lossRatio > 1 ? "text-alert" : ""} />
            <Kpi label="Policies" value={d ? d.totals.policies.toLocaleString() : "…"} hint={d ? `${d.totals.centres} centres` : ""} />
            <Kpi label="Premium income" value={d ? sgd(d.totals.premiumIncome) : "…"} hint="per year" />
            <Kpi label="Island risk cost" value={d ? sgd(d.island.avgRiskCost) : "…"} hint="expected payout / policy / yr" />
          </div>

          <Card className="p-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="caps text-ink">Fig. — loss ratio by year · back-tested 2014–2026</div>
                <div className="text-xs text-ink-2">Purple = recovered under aggregate stop-loss above {pct(opts.stopLossAttach)}</div>
              </div>
            </div>
            {d ? <LossRatioChart years={d.years} h={220} /> : <div className="skeleton h-52 rounded-sm" />}
          </Card>

          <Why>
            Parametric cover fails when a bad season empties the pool (MiCRO 2018) or when nobody can afford it (Caribbean LPP). The loss ratio, stress
            test and fairness table answer both at once: sustainable for Income, affordable for the stall, and no area priced out.
          </Why>
          <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-6">
              <div className="caps text-ink">Fig. — haze catastrophe stress test</div>
              <div className="mb-4 text-xs text-ink-2">PSI hits every policy at once — island-wide for N days (2015 peaked at 322)</div>
              <div className="space-y-3">
                {d?.stress.map((s) => (
                  <div key={`${s.psi}-${s.days}`}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-ink-2">PSI {s.psi} for {s.days} days <span className="text-ink-3">(pays {s.payDays})</span></span>
                      <span className="font-mono">{sgd(s.gross)} · LR {pct(s.lossRatio)}</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-paper-2">
                      <motion.div className="h-2 bg-haze" animate={{ width: `${Math.min(100, ((s.gross - s.ceded) / Math.max(s.gross, d.totals.premiumIncome * 1.5)) * 100)}%` }} />
                      <motion.div className="h-2 bg-haze/40" animate={{ width: `${Math.min(100, (s.ceded / Math.max(s.gross, d.totals.premiumIncome * 1.5)) * 100)}%` }} />
                    </div>
                    {s.ceded > 0 && <div className="mt-0.5 text-[10px] text-haze">{sgd(s.ceded)} recovered from the reinsurer</div>}
                  </div>
                )) ?? <div className="skeleton h-28 rounded-sm" />}
              </div>
            </Card>
            <Card className="p-6">
              <div className="caps text-ink">Fig. — worst days for the pool</div>
              <div className="mb-3 text-xs text-ink-2">Concurrent payouts across all centres on one day</div>
              <div className="space-y-1.5">
                {d?.topDays.slice(0, 7).map((t, i) => (
                  <div key={t.date} className="flex items-center gap-3 text-xs">
                    <span className="w-4 text-ink-3">{i + 1}</span>
                    <span className="w-[86px] shrink-0 font-mono">{t.date}</span>
                    <span className="h-1.5 flex-1 rounded-full bg-paper-2">
                      <span className="block h-1.5 rounded-full" style={{ width: `${(t.payout / d.topDays[0].payout) * 100}%`, background: PERIL_COLOR[t.peril ?? "rain"] }} />
                    </span>
                    <span className="w-20 text-right font-mono">{sgd(t.payout)}</span>
                    <span className="hidden w-24 text-right text-ink-3 sm:inline">{t.policies.toLocaleString()} policies</span>
                  </div>
                )) ?? <div className="skeleton h-40 rounded-sm" />}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
            <Card className="relative min-h-[380px] overflow-hidden">
              <MapView className="absolute inset-0" layers={layers} zoom={10.4} />
              <div className="sheet absolute left-3 top-3 rounded-sm px-3 py-2 text-[11px] text-ink-2">
                Colour = raw local risk vs island · <span className="text-plate">low</span> → <span className="text-heat">high</span>
              </div>
            </Card>
            <Card className="p-6">
              <div className="caps text-ink">Fig. — fairness by region (MAS FEAT)</div>
              <div className="mb-3 text-xs text-ink-2">Raw back-tested risk vs the premium actually charged after the ±{pct(spec.loadings.zoneCap)} cap</div>
              <table className="w-full text-xs">
                <thead className="text-ink-3">
                  <tr className="text-left">
                    <th className="pb-2 font-normal">Region</th>
                    <th className="pb-2 font-normal">Stalls</th>
                    <th className="pb-2 text-right font-normal">Raw risk</th>
                    <th className="pb-2 text-right font-normal">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {d?.regions
                    .slice()
                    .sort((a, b) => b.rawZoneFactor - a.rawZoneFactor)
                    .map((r) => (
                      <tr key={r.region} className="border-t border-[var(--rule)]">
                        <td className="py-2 capitalize">{r.region}</td>
                        <td className="py-2 text-ink-2">{r.stalls.toLocaleString()}</td>
                        <td className={`py-2 text-right font-mono ${r.rawZoneFactor > 1 + spec.loadings.zoneCap ? "text-heat" : ""}`}>×{r.rawZoneFactor.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono">{sgd(r.avgWeeklyPremium, 2)}/wk</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                Location affects price only through back-tested payouts at the nearest public gauge. No personal attributes are used. The cap
                spreads the cost of the most exposed areas across the pool.
              </p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            <HeatModelCard meta={meta.data} />
            <DataCard meta={meta.data} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-2">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function PerilControls({
  spec,
  set,
  peril,
  unit,
  min,
  max,
  step,
}: {
  spec: Spec;
  set: (fn: (s: Spec) => void) => void;
  peril: "rain" | "heat" | "haze";
  unit: string;
  min: number;
  max: number;
  step: number;
}) {
  const p = spec.perils[peril];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: PERIL_COLOR[peril] }}>{peril}</span>
        <Toggle checked={p.enabled} onChange={(v) => set((s) => (s.perils[peril].enabled = v))} label="" />
      </div>
      {p.enabled && (
        <div className="space-y-4">
          {p.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <Range label={`Tier ${i + 1} at`} value={t.threshold} min={min} max={max} step={step} format={(v) => `${v} ${unit}`} onChange={(v) => set((s) => (s.perils[peril].tiers[i].threshold = v))} />
              <Range label="pays" value={t.payoutPct} min={0} max={1} step={0.05} format={(v) => `${pct(v)} · ${sgd(v * spec.insuredDailyIncome)}`} onChange={(v) => set((s) => (s.perils[peril].tiers[i].payoutPct = v))} />
            </div>
          ))}
          <Range label="Max days / year for this peril" value={p.maxDays} min={0} max={15} step={1} onChange={(v) => set((s) => (s.perils[peril].maxDays = v))} />
          {peril === "heat" && (
            <Range label="Worksite offset added to station WBGT" value={spec.perils.heat.siteOffset} min={-1} max={3} step={0.25} format={(v) => `+${v}°C`} onChange={(v) => set((s) => (s.perils.heat.siteOffset = v))} />
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, accent = "" }: { label: string; value: React.ReactNode; hint?: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${accent}`}>{value}</div>
      {hint && <div className="text-[10px] text-ink-3">{hint}</div>}
    </Card>
  );
}

function HeatModelCard({ meta }: { meta: MetaResponse | null }) {
  const m = meta?.heatModel;
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="caps text-ink">Explainable heat model</div>
        <span className="rounded-full bg-heat-2 px-2 py-0.5 text-[10px] text-heat">{m?.version ?? "not fitted"}</span>
      </div>
      <div className="mt-1 text-xs text-ink-2">
        NEA WBGT only exists from Feb 2025. To price heat over 12 years we fit a published linear model on MSS temperatures, then price each
        day by the <i>probability</i> WBGT crossed the trigger. Live payouts always use observed WBGT.
      </div>
      {m ? (
        <>
          <div className="mt-4 space-y-1.5">
            {m.features.map((f, i) => {
              const v = m.coefficients[i];
              return (
                <div key={f} className="flex items-center gap-3 text-xs">
                  <span className="w-32 text-ink-2">{f}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-paper-2">
                    {i > 0 && <span className="block h-1.5 rounded-full bg-heat" style={{ width: `${Math.min(100, Math.abs(v) * 150)}%`, opacity: v < 0 ? 0.5 : 1 }} />}
                  </span>
                  <span className="w-16 text-right font-mono">{v.toFixed(3)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            <MiniStat k="Train R²" v={m.train.r2.toFixed(2)} />
            <MiniStat k="Hold-out R²" v={m.validation.r2.toFixed(2)} />
            <MiniStat k="Hold-out MAE" v={`${m.validation.mae}°C`} />
            <MiniStat k="Pairs" v={m.train.n + m.validation.n} />
          </div>
          <div className="mt-3 text-[11px] text-ink-3">
            Hold-out {m.validation.from} → {m.validation.to}. Daily temperature explains WBGT only partly (humidity isn&apos;t in the daily
            record), so the residual σ = {m.residualSigma}°C is priced in rather than ignored.
          </div>
        </>
      ) : (
        <div className="skeleton mt-4 h-40 rounded-sm" />
      )}
    </Card>
  );
}

function MiniStat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-sm bg-paper-2 p-2">
      <div className="font-mono text-ink">{v}</div>
      <div className="text-[10px] text-ink-3">{k}</div>
    </div>
  );
}

function DataCard({ meta }: { meta: MetaResponse | null }) {
  const c = meta?.coverage;
  const rows: [string, string][] = c
    ? [
        ["MSS rain gauges (daily max 30/60/120-min)", `${c.rainStations} · ${c.rainFrom} → ${c.rainTo}`],
        ["MSS temperature stations", `${c.tempStations}`],
        ["NEA WBGT stations (15-min)", `${c.wbgtStations} · ${c.wbgtDays} sampled days since Feb 2025`],
        ["NEA 24-h PSI by region (hourly)", `${c.psiFrom} → ${c.psiTo}`],
        ["NEA evening forecasts (Prep Pay back-test)", c.forecastDays ? `${c.forecastDays} days since ${c.forecastFrom}` : "loading"],
        ["NEA hawker centres", `${c.hawkerCentres} centres · ${c.stalls.toLocaleString()} stalls`],
        ["Changi long record", `${meta?.climate.years[0]?.year} → ${meta?.climate.years.at(-1)?.year}`],
      ]
    : [];
  return (
    <Card className="p-6">
      <div className="caps text-ink">Data lineage</div>
      <div className="mb-3 text-xs text-ink-2">Independent, published, timely — the brief&apos;s test for a trigger source. Fallback: next gauge, then last good snapshot.</div>
      <div className="space-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--rule)] pb-2">
            <span className="text-ink-2">{k}</span>
            <span className="text-right font-mono text-ink/80">{v}</span>
          </div>
        ))}
        {!c && <div className="skeleton h-40 rounded-sm" />}
      </div>
    </Card>
  );
}
