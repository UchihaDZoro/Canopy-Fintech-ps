"use client";
import type { BacktestResponse } from "@/lib/client/types";
import { Card, Counter, PERIL_COLOR, pct, sgd } from "@/components/ui";

export function Honesty({ data }: { data: BacktestResponse }) {
  const { stats, prepPay, period, years } = data.backtest;
  const p = data.product;
  const total = years.reduce((a, y) => a + y.payout, 0);
  const totalPremium = data.quote.annualPremium * period.years;
  const perilMax = Math.max(stats.byPeril.rain, stats.byPeril.heat, stats.byPeril.haze, 1);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-alert">Said plainly</div>
        <p className="mt-3 sign-soft text-3xl leading-snug">
          Over {period.years.toFixed(1)} years Daycover+ would have paid you on about{" "}
          <span className="text-plate">{stats.avgTriggerDays.toFixed(1)} days a year</span>. On about{" "}
          <span className="text-alert">{stats.avgMissedLossDays.toFixed(1)} other days a year</span> you probably lost at least{" "}
          {Math.round(p.lossModel.lossDayThreshold * 100)}% of takings and it would have paid <em>nothing</em>.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
          <Metric label="Years with a payout" value={<Counter value={stats.yearsWithPayoutPct * 100} suffix="%" />} hint="no empty first season" />
          <Metric label="Paid vs premium" value={sgd(total)} hint={`vs ~${sgd(totalPremium)} premiums`} />
          <Metric
            label="Neighbour gauges agree"
            value={stats.gaugeAgreement === null ? "—" : pct(stats.gaugeAgreement)}
            hint="spatial basis risk: storms are local"
          />
          <Metric label="Payout ÷ modelled loss" value={stats.payoutToLossOnTriggerDays.toFixed(2)} hint="≤ 1 on trigger days = insurance, not a bet" />
        </div>
      </Card>
      <Card className="p-6">
        <div className="text-[11px] uppercase tracking-[0.16em] text-ink-2">Where the money comes from</div>
        <div className="mt-4 space-y-3">
          {(["rain", "heat", "haze"] as const).map((k) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="capitalize" style={{ color: PERIL_COLOR[k] }}>{k}</span>
                <span className="font-mono text-ink-2">{sgd(stats.byPeril[k])}/yr</span>
              </div>
              <div className="h-1.5 rounded-full bg-paper-2">
                <div className="h-1.5 rounded-full" style={{ width: `${(stats.byPeril[k] / perilMax) * 100}%`, background: PERIL_COLOR[k] }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-[var(--rule)] pt-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-plate">Prep Pay, back-tested on NEA forecasts</div>
          {prepPay.forecastDays > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Mini v={prepPay.forecastAlertsPerYear.toFixed(1)} l="storm alerts / yr" />
              <Mini v={pct(prepPay.hitRate)} l="alerts → payout" />
              <Mini v={pct(prepPay.triggersForewarned)} l="payouts forewarned" />
            </div>
          ) : (
            <div className="mt-2 text-xs text-ink-3">Forecast archive still loading — re-run the pipeline to include it.</div>
          )}
          <div className="mt-2 text-[11px] text-ink-3">
            {prepPay.forecastDays} archived evening forecasts · {Math.min(data.product.prepPay.maxPerYear, prepPay.advancesPerYear).toFixed(1)} advances/yr after the cap · net cost {sgd(prepPay.netCostPerYear)}/yr
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-[11px] text-ink-3">{hint}</div>
    </div>
  );
}
function Mini({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-sm bg-paper-2 p-2">
      <div className="font-mono text-lg text-ink">{v}</div>
      <div className="text-[10px] text-ink-3">{l}</div>
    </div>
  );
}
