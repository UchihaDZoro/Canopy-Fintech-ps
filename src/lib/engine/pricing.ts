import { clamp, round } from "./math";
import type { BacktestResult, ProductSpec, Quote } from "./types";

/** Expected annual cost of one policy at a location (payouts + net Prep Pay advances) */
export function riskCost(bt: BacktestResult, spec: ProductSpec) {
  return bt.stats.avgAnnualPayout + (spec.prepPay.enabled ? bt.prepPay.netCostPerYear : 0);
}

/**
 * Transparent premium build-up:
 *   risk cost (back-tested) → climate-trend projection → catastrophe load
 *   → community-rated zone factor (capped for fairness, MAS FEAT) → gross-up for expenses & margin
 */
export function priceQuote(
  bt: BacktestResult,
  spec: ProductSpec,
  island: { avgRiskCost: number; avgSd: number },
  projectionYear = new Date().getFullYear() + 1
): Quote {
  const L = spec.loadings;
  const years = bt.years.map((y) => y.year);
  const midYear = (Math.min(...years) + Math.max(...years)) / 2;
  const trendFactor = Math.pow(1 + L.climateTrend, Math.max(0, projectionYear - midYear));

  const localCost = riskCost(bt, spec);
  const rawZoneFactor = island.avgRiskCost > 0 ? localCost / island.avgRiskCost : 1;
  const zoneFactor = clamp(rawZoneFactor, 1 - L.zoneCap, 1 + L.zoneCap);

  // Community rating: island-wide cost × capped local relativity
  const pure = island.avgRiskCost * zoneFactor;
  const prepShare = localCost > 0 ? (spec.prepPay.enabled ? bt.prepPay.netCostPerYear / localCost : 0) : 0;
  const trended = pure * trendFactor;
  const cat = L.catLoad * island.avgSd * zoneFactor;
  const risk = trended + cat;
  const gross = risk / (1 - L.expenseRatio - L.riskMargin);

  return {
    annualPremium: round(gross),
    weeklyPremium: round(gross / 52),
    dailyPremium: round(gross / 365),
    pctOfDailyIncome: round(gross / 365 / spec.insuredDailyIncome, 4),
    breakdown: {
      purePremium: round(pure * (1 - prepShare)),
      prepPayCost: round(pure * prepShare),
      trendLoad: round(trended - pure),
      catLoad: round(cat),
      expenses: round(gross * L.expenseRatio),
      margin: round(gross * L.riskMargin),
    },
    zoneFactor: round(zoneFactor, 3),
    rawZoneFactor: round(rawZoneFactor, 3),
    expectedLossRatio: round(gross ? trended / gross : 0, 3),
  };
}
