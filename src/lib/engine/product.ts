import { z } from "zod";
import type { ProductSpec } from "./types";

// Default product design for the launch segment (hawkers / stallholders).
// These are starting values for the Actuary Studio, where every one is adjustable and
// re-priced live against the historical record.
export const DEFAULT_PRODUCT: ProductSpec = {
  segment: "hawker",
  // ~S$3,600/month median hawker net earnings → S$120/day of income at risk
  insuredDailyIncome: 120,
  perils: {
    // MSS "highest 60-min rainfall" at the nearest working gauge.
    // Calibrated on 2014–2026: ≥50 mm ≈ 2.8 days/yr, ≥70 mm ≈ 0.4 days/yr at the median gauge.
    rain: {
      enabled: true,
      maxDays: 4,
      tiers: [
        { threshold: 50, payoutPct: 0.3 },
        { threshold: 70, payoutPct: 0.6 },
      ],
    },
    // NEA WBGT bands: 31 = Moderate, 33 = High. Measured 2025–26: daily max ≥33 on a median
    // 6.7 days/yr per station (but ≥32.5 on 23). The worksite gap is handled by triggering at the
    // station's "High" band itself (sites run hotter than stations), not by a higher extreme;
    // `siteOffset` lets Income add an explicit correction once worksite data exists.
    heat: {
      enabled: true,
      maxDays: 3,
      siteOffset: 0,
      tiers: [
        { threshold: 33, payoutPct: 0.1 },
        { threshold: 34, payoutPct: 0.25 },
      ],
    },
    // NEA 24-h PSI bands: 101–200 Unhealthy, 201–300 Very unhealthy
    haze: {
      enabled: true,
      maxDays: 4,
      tiers: [
        { threshold: 101, payoutPct: 0.15 },
        { threshold: 201, payoutPct: 0.4 },
      ],
    },
  },
  maxPayableDaysPerYear: 8,
  // Back-test vs 717 archived NEA evening forecasts: "heavy thundery showers" for a region is
  // issued ~25×/yr but only ~2% are followed by a trigger at a given gauge. So Prep Pay is an
  // advance on the next payout (recouped, never owed back), capped at 4 a year.
  prepPay: { enabled: true, minSeverity: 3, heatForecastC: 35, advancePct: 0.05, maxPerYear: 4, recoup: true },
  loadings: { expenseRatio: 0.2, riskMargin: 0.06, climateTrend: 0.02, catLoad: 0.25, zoneCap: 0.15 },
  stationRadiusKm: 5,
  // Revenue-drop assumptions (editable). Daily "wettest hour" includes night rain, which
  // doesn't hurt trade, so the rain response starts at 12 mm/hr and a loss day is ≥25%.
  lossModel: {
    rainSlope: 0.01,
    rainFree: 12,
    rainCap: 0.6,
    heatSlope: 0.08,
    heatFree: 31,
    heatCap: 0.35,
    hazeBase: 0.1,
    hazeSlope: 0.0015,
    hazeCap: 0.5,
    lossDayThreshold: 0.25,
  },
};

const tier = z.object({ threshold: z.number().min(0).max(1000), payoutPct: z.number().min(0).max(1.5) });
const peril = z.object({ enabled: z.boolean(), tiers: z.array(tier).min(1).max(4), maxDays: z.number().min(0).max(60) });

export const ProductSchema = z.object({
  segment: z.enum(["hawker", "outdoor"]),
  insuredDailyIncome: z.number().min(20).max(5000),
  perils: z.object({ rain: peril, heat: peril.extend({ siteOffset: z.number().min(-2).max(4) }), haze: peril }),
  maxPayableDaysPerYear: z.number().int().min(1).max(60),
  prepPay: z.object({
    enabled: z.boolean(),
    minSeverity: z.union([z.literal(2), z.literal(3)]),
    heatForecastC: z.number().min(30).max(40),
    advancePct: z.number().min(0).max(0.5),
    maxPerYear: z.number().int().min(0).max(60),
    recoup: z.boolean(),
  }),
  loadings: z.object({
    expenseRatio: z.number().min(0).max(0.5),
    riskMargin: z.number().min(0).max(0.4),
    climateTrend: z.number().min(-0.05).max(0.2),
    catLoad: z.number().min(0).max(2),
    zoneCap: z.number().min(0).max(1),
  }),
  stationRadiusKm: z.number().min(1).max(15),
  lossModel: z.object({
    rainSlope: z.number(),
    rainFree: z.number(),
    rainCap: z.number(),
    heatSlope: z.number(),
    heatFree: z.number(),
    heatCap: z.number(),
    hazeBase: z.number(),
    hazeSlope: z.number(),
    hazeCap: z.number(),
    lossDayThreshold: z.number().min(0).max(1),
  }),
});

/** Merge a partial override into the default spec (deep) and validate */
export function resolveProduct(partial?: unknown): ProductSpec {
  if (!partial) return DEFAULT_PRODUCT;
  const merged = deepMerge(structuredClone(DEFAULT_PRODUCT), partial as Record<string, unknown>);
  return ProductSchema.parse(merged) as ProductSpec;
}

function deepMerge<T>(base: T, over: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(over ?? {})) {
    const b = (base as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)) {
      deepMerge(b, v as Record<string, unknown>);
    } else if (v !== undefined) {
      (base as Record<string, unknown>)[k] = v;
    }
  }
  return base;
}
