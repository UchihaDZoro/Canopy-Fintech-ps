import "server-only";
import { store } from "@/lib/data/store";
import { runBacktest } from "./backtest";
import { mean, round, sd } from "./math";
import { priceQuote, riskCost } from "./pricing";
import type { ProductSpec, Region } from "./types";

export interface PortfolioOptions {
  takeUp: number; // share of stalls that buy cover
  stopLossAttach: number; // aggregate stop-loss attaches at this loss ratio
  stopLossLimit: number; // ... and covers up to this loss ratio
}
export const DEFAULT_PORTFOLIO: PortfolioOptions = { takeUp: 0.3, stopLossAttach: 1.2, stopLossLimit: 3 };

const cache = new Map<string, ReturnType<typeof compute>>();

/** Key-order-independent JSON, so equal specs share a cache entry whatever path built them */
function stableKey(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableKey).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableKey((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** Island-wide community-rating base. Payouts and advances scale linearly with the
 *  insured daily income, so compute once at a reference income and rescale. */
export function islandBaseline(spec: ProductSpec) {
  const REF = 120; // = default insured income, so this shares the cache with the landing page portfolio
  const base = portfolio({ ...spec, insuredDailyIncome: REF }, DEFAULT_PORTFOLIO).island;
  const k = spec.insuredDailyIncome / REF;
  return { avgRiskCost: round(base.avgRiskCost * k), avgSd: round(base.avgSd * k) };
}

export function portfolio(spec: ProductSpec, opts: PortfolioOptions = DEFAULT_PORTFOLIO) {
  const key = stableKey([spec, opts, store.version()]);
  let r = cache.get(key);
  if (!r) {
    r = compute(spec, opts);
    if (cache.size > 40) cache.clear();
    cache.set(key, r);
  }
  return r;
}

function compute(spec: ProductSpec, opts: PortfolioOptions) {
  const centres = store.hawkers().filter((c) => c.stalls > 0);
  const runs = centres.map((c) => ({ c, bt: runBacktest({ lat: c.lat, lon: c.lon, label: c.name }, spec) }));

  // Island-wide (stall-weighted) risk cost and volatility = community-rating base
  const totalStalls = centres.reduce((a, c) => a + c.stalls, 0);
  const avgRiskCost = runs.reduce((a, r) => a + riskCost(r.bt, spec) * r.c.stalls, 0) / totalStalls;
  const avgSd = runs.reduce((a, r) => a + r.bt.stats.sdAnnualPayout * r.c.stalls, 0) / totalStalls;
  const island = { avgRiskCost: round(avgRiskCost), avgSd: round(avgSd) };

  // Aggregate by date (concurrency) and by year
  const daily = new Map<string, { payout: number; policies: number; perils: Record<string, number> }>();
  const yearly = new Map<number, { payout: number; premium: number }>();
  const byRegion = new Map<Region, { stalls: number; premium: number; risk: number; rawZone: number; centres: number }>();
  const centreRows = [];
  let premiumIncome = 0;
  let policies = 0;

  for (const { c, bt } of runs) {
    const q = priceQuote(bt, spec, island);
    const n = Math.round(c.stalls * opts.takeUp);
    policies += n;
    premiumIncome += q.annualPremium * n;
    for (const d of bt.days) {
      if (d.payoutPct <= 0 && !d.advance) continue;
      const amt = d.payoutPct * spec.insuredDailyIncome * n;
      const agg = daily.get(d.date) ?? { payout: 0, policies: 0, perils: {} };
      agg.payout += amt;
      if (d.payoutPct > 0 && d.peril) agg.perils[d.peril] = (agg.perils[d.peril] ?? 0) + amt;
      if (d.payoutPct > 0 && d.prob >= 0.5) agg.policies += n;
      daily.set(d.date, agg);
    }
    for (const y of bt.years) {
      const Y = yearly.get(y.year) ?? { payout: 0, premium: 0 };
      Y.payout += (y.payout + (spec.prepPay.enabled ? y.advances : 0)) * n;
      Y.premium += (q.annualPremium * n * y.days) / 365.25;
      yearly.set(y.year, Y);
    }
    const reg = bt.stations.region;
    const R = byRegion.get(reg) ?? { stalls: 0, premium: 0, risk: 0, rawZone: 0, centres: 0 };
    R.stalls += c.stalls;
    R.premium += q.weeklyPremium * c.stalls;
    R.risk += riskCost(bt, spec) * c.stalls;
    R.rawZone += q.rawZoneFactor * c.stalls;
    R.centres++;
    byRegion.set(reg, R);
    centreRows.push({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      stalls: c.stalls,
      region: reg,
      station: bt.stations.rain[0]?.id ?? null,
      stationKm: bt.stations.rain[0]?.km ?? null,
      weeklyPremium: q.weeklyPremium,
      zoneFactor: q.zoneFactor,
      rawZoneFactor: q.rawZoneFactor,
      avgAnnualPayout: bt.stats.avgAnnualPayout,
      avgTriggerDays: bt.stats.avgTriggerDays,
      yearsWithPayoutPct: bt.stats.yearsWithPayoutPct,
      byPeril: bt.stats.byPeril,
      gaugeAgreement: bt.stats.gaugeAgreement,
    });
  }

  const years = [...yearly.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => {
      const lr = v.premium ? v.payout / v.premium : 0;
      const cededLR = Math.max(0, Math.min(lr, opts.stopLossLimit) - opts.stopLossAttach);
      return {
        year,
        payout: round(v.payout),
        premium: round(v.premium),
        lossRatio: round(lr, 3),
        ceded: round(cededLR * v.premium),
        netLossRatio: round(lr - cededLR, 3),
      };
    });
  const full = years.filter((y) => y.premium > premiumIncome * 0.9);
  const topDays = [...daily.entries()]
    .sort((a, b) => b[1].payout - a[1].payout)
    .slice(0, 12)
    .map(([date, v]) => ({
      date,
      payout: round(v.payout),
      policies: v.policies,
      peril: Object.entries(v.perils).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }));

  // Haze catastrophe stress: island-wide PSI at `psi` for `days` days (2015 peak was 322)
  const hazeStress = (psi: number, days: number) => {
    let pct = 0;
    if (spec.perils.haze.enabled) for (const t of spec.perils.haze.tiers) if (psi >= t.threshold) pct = Math.max(pct, t.payoutPct);
    const payDays = Math.min(days, spec.perils.haze.maxDays, spec.maxPayableDaysPerYear);
    const gross = pct * spec.insuredDailyIncome * policies * payDays;
    const lr = premiumIncome ? gross / premiumIncome : 0;
    const ceded = Math.max(0, Math.min(lr, opts.stopLossLimit) - opts.stopLossAttach) * premiumIncome;
    return { psi, days, payDays, gross: round(gross), lossRatio: round(lr, 3), ceded: round(ceded), net: round(gross - ceded) };
  };

  const regions = [...byRegion.entries()].map(([region, v]) => ({
    region,
    centres: v.centres,
    stalls: v.stalls,
    avgWeeklyPremium: round(v.premium / v.stalls),
    avgRiskCost: round(v.risk / v.stalls),
    rawZoneFactor: round(v.rawZone / v.stalls, 3),
  }));

  return {
    island,
    totals: {
      centres: centres.length,
      stalls: totalStalls,
      policies,
      premiumIncome: round(premiumIncome),
      avgLossRatio: round(mean(full.map((y) => y.lossRatio)), 3),
      sdLossRatio: round(sd(full.map((y) => y.lossRatio)), 3),
      worstYear: full.reduce((w, y) => (y.lossRatio > (w?.lossRatio ?? -1) ? y : w), full[0]),
    },
    years,
    topDays,
    stress: [hazeStress(150, 14), hazeStress(250, 7), hazeStress(322, 21)],
    regions,
    centres: centreRows,
    options: opts,
  };
}
