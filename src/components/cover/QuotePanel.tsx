"use client";
import { motion } from "motion/react";
import type { BacktestResponse } from "@/lib/client/types";
import { Card, Counter, PERIL_COLOR, PERIL_LABEL, pct, sgd } from "@/components/ui";

const UNITS = { rain: "mm in 1 hr", heat: "°C WBGT", haze: "24-h PSI" } as const;

export function QuotePanel({ data }: { data: BacktestResponse }) {
  const { quote, product, backtest } = data;
  const inc = product.insuredDailyIncome;
  const parts = [
    { k: "Expected payouts", v: quote.breakdown.purePremium, c: "#0b6e4f" },
    { k: "Prep Pay advances", v: quote.breakdown.prepPayCost, c: "#0e8a66" },
    { k: "Climate trend", v: quote.breakdown.trendLoad, c: "#d2480f" },
    { k: "Catastrophe load", v: quote.breakdown.catLoad, c: "#6f52a3" },
    { k: "Expenses (20%)", v: quote.breakdown.expenses, c: "#868170" },
    { k: "Margin", v: quote.breakdown.margin, c: "#16150f" },
  ];
  const total = parts.reduce((a, p) => a + p.v, 0);
  const benchmark = 0.075; // Philippines micro-insurance cap: 7.5% of daily minimum wage per day
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card className="relative overflow-hidden p-6 md:p-8">
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-2">Your Daycover+ premium</div>
          <div className="mt-2 flex items-end gap-3">
            <div className="sign-soft text-8xl leading-none text-plate">
              <Counter key={quote.weeklyPremium} value={quote.weeklyPremium} decimals={2} prefix="S$" duration={1.2} />
            </div>
            <div className="pb-3 text-ink-2">/ week</div>
          </div>
          <div className="mt-2 text-sm text-ink-2">
            {sgd(quote.dailyPremium, 2)} a day · {pct(quote.pctOfDailyIncome, 1)} of your daily take-home · expected loss ratio{" "}
            {pct(quote.expectedLossRatio)}
          </div>

          <div className="mt-7">
            <div className="flex h-3 overflow-hidden rounded-full bg-paper-2">
              {parts.map((p, i) => (
                <motion.div
                  key={p.k}
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.v / total) * 100}%` }}
                  transition={{ duration: 1, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  style={{ background: p.c }}
                  title={`${p.k}: ${sgd(p.v, 2)}`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
              {parts.map((p) => (
                <div key={p.k} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <i className="h-2 w-2 rounded-sm" style={{ background: p.c }} />
                    {p.k}
                  </span>
                  <span className="font-mono text-ink/80">{sgd(p.v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-none border border-[var(--rule)] bg-paper-2 p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2">Affordability</div>
              <div className="mt-2 h-2 rounded-full bg-paper-2">
                <motion.div
                  className="h-2 rounded-full bg-plate"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (quote.pctOfDailyIncome / benchmark) * 100)}%` }}
                  transition={{ duration: 1.2 }}
                />
              </div>
              <div className="mt-2 text-xs text-ink-3">
                {pct(quote.pctOfDailyIncome, 1)} of daily income vs the 7.5% micro-insurance cap used in the Philippines
              </div>
            </div>
            <div className="rounded-none border border-[var(--rule)] bg-paper-2 p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2">Fair location pricing</div>
              <div className="mt-1 text-lg font-semibold">×{quote.zoneFactor.toFixed(2)}</div>
              <div className="text-xs text-ink-3">
                Raw local risk ×{quote.rawZoneFactor.toFixed(2)} of island average, capped at ±{Math.round(product.loadings.zoneCap * 100)}% so
                exposed areas aren&apos;t priced out (MAS FEAT)
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 md:p-8">
        <div className="text-[11px] uppercase tracking-[0.16em] text-ink-2">What you get, and when</div>
        <div className="mt-1 text-sm text-ink-3">
          Paid automatically by PayNow on the day. The day pays the single highest level reached. Up to {product.maxPayableDaysPerYear} days a
          year.
        </div>
        <div className="mt-5 space-y-5">
          {(["rain", "heat", "haze"] as const).map((p, pi) => {
            const peril = product.perils[p];
            if (!peril.enabled) return null;
            const station =
              p === "rain"
                ? `${backtest.stations.rain[0]?.id} · ${backtest.stations.rain[0]?.km} km`
                : p === "heat"
                  ? `${backtest.stations.wbgt?.name ?? "NEA WBGT"}${product.perils.heat.siteOffset ? ` +${product.perils.heat.siteOffset}°C site` : ""}`
                  : `${backtest.stations.region} region`;
            return (
              <motion.div key={p} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * pi }}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium" style={{ color: PERIL_COLOR[p] }}>{PERIL_LABEL[p]}</span>
                  <span className="text-[11px] capitalize text-ink-3">{station}</span>
                </div>
                <div className="grid grid-cols-[1fr_repeat(2,minmax(0,1fr))] gap-1.5 text-xs">
                  <div className="rounded-sm border border-[var(--rule)] bg-paper-2 p-2.5">
                    <div className="text-ink-3">Below {peril.tiers[0].threshold}</div>
                    <div className="mt-0.5 font-mono text-ink-2">S$0</div>
                  </div>
                  {peril.tiers.map((t, i) => (
                    <div key={i} className="rounded-sm p-2.5" style={{ background: `${PERIL_COLOR[p]}${i ? "2e" : "17"}`, boxShadow: `inset 0 0 0 1px ${PERIL_COLOR[p]}33` }}>
                      <div className="text-ink/80">
                        ≥{t.threshold} <span className="text-ink-3">{UNITS[p]}</span>
                      </div>
                      <div className="mt-0.5 font-mono font-semibold" style={{ color: PERIL_COLOR[p] }}>
                        {sgd(t.payoutPct * inc)}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
          {product.prepPay.enabled && (
            <div className="rounded-sm border border-plate bg-plate-2 p-3 text-xs text-ink-2">
              <span className="font-semibold text-plate">Prep Pay:</span> {sgd(product.prepPay.advancePct * inc)} at 6pm when NEA forecasts{" "}
              {product.prepPay.minSeverity === 3 ? "heavy" : ""} thundery showers for your region tomorrow
              {product.perils.heat.enabled ? ` or a high of ${product.prepPay.heatForecastC}°C+` : ""}. Up to {product.prepPay.maxPerYear} a year
              {product.prepPay.recoup ? ", taken off your next payout — never owed back" : ", yours to keep"}.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
