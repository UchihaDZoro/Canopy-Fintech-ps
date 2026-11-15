// Canopy — core domain types. Every number that shapes a payout is a parameter of
// ProductSpec (editable in the Actuary Studio), never a constant buried in code.

export type Peril = "rain" | "heat" | "haze";
export type Region = "north" | "south" | "east" | "west" | "central";

export interface Tier {
  /** Index level at which the tier pays (rain: mm in the wettest 60 min; heat: °C WBGT; haze: 24-h PSI) */
  threshold: number;
  /** Payout as a fraction of the insured daily income */
  payoutPct: number;
}

export interface PerilSpec {
  enabled: boolean;
  tiers: Tier[];
  /** Max payable days per year for this peril — stops one season's peril using up the cover */
  maxDays: number;
}

export interface LossModel {
  /** Revenue drop per mm of 60-min rainfall above `rainFree` */
  rainSlope: number;
  rainFree: number;
  rainCap: number;
  /** Revenue drop per °C of WBGT above `heatFree` */
  heatSlope: number;
  heatFree: number;
  heatCap: number;
  /** Revenue drop when PSI > 100, plus slope per PSI point above 100 */
  hazeBase: number;
  hazeSlope: number;
  hazeCap: number;
  /** A day counts as a "loss day" when modelled revenue drop ≥ this fraction */
  lossDayThreshold: number;
}

export interface ProductSpec {
  segment: "hawker" | "outdoor";
  /** Verified average daily takings (S$) — sizes payouts to the insurable interest */
  insuredDailyIncome: number;
  perils: {
    rain: PerilSpec;
    heat: PerilSpec & { siteOffset: number };
    haze: PerilSpec;
  };
  /** Payable days cap per policy year (pools perils, protects the pool) */
  maxPayableDaysPerYear: number;
  prepPay: {
    enabled: boolean;
    /** Forecast severity that releases the advance: 2 = thundery showers, 3 = heavy */
    minSeverity: 2 | 3;
    /** Forecast max temperature (°C) that releases a heat advance */
    heatForecastC: number;
    /** Advance as a fraction of insured daily income */
    advancePct: number;
    /** Max advances per year (forecast alerts are frequent; this bounds cost) */
    maxPerYear: number;
    /** true = advance is deducted from the next payout(s) that year, never owed back */
    recoup: boolean;
  };
  loadings: {
    expenseRatio: number;
    riskMargin: number;
    /** Annual growth in expected payouts from climate trend (fraction / year) */
    climateTrend: number;
    /** Catastrophe loading as a multiple of the annual payout standard deviation */
    catLoad: number;
    /** Max premium difference between locations vs. island average (fairness cap) */
    zoneCap: number;
  };
  /** Gauges further than this are not used for the trigger */
  stationRadiusKm: number;
  lossModel: LossModel;
}

export interface Location {
  lat: number;
  lon: number;
  label?: string;
}

export interface StationRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  km: number;
}

export interface DayResult {
  date: string;
  rain: number | null; // mm in wettest 60 min
  rainStation: string | null;
  wbgt: number | null; // °C (observed or modelled) incl. site offset
  wbgtSource: "observed" | "modelled" | null;
  psi: number | null;
  /** Fractional expected payout (probabilistic for modelled heat) as share of income */
  payoutPct: number;
  /** Probability the day is a payable trigger (1 for observed indices) */
  prob: number;
  /** Peril that drove the payout (highest tier) */
  peril: Peril | null;
  tier: number; // 0 = none, 1.. = tier index + 1
  capped: boolean;
  advance: boolean;
  lossPct: number; // modelled revenue drop
  lossDay: boolean;
}

export interface YearSummary {
  year: number;
  days: number;
  triggerDays: number;
  payout: number; // S$
  advances: number; // S$ (net cost of advances not followed by a payout)
  lossDays: number;
  missedLossDays: number;
  lossAmount: number; // S$ modelled
  byPeril: Record<Peril, number>;
}

export interface BacktestResult {
  location: Location;
  stations: { rain: StationRef[]; temp: StationRef | null; wbgt: StationRef | null; region: Region };
  period: { from: string; to: string; years: number };
  days: DayResult[];
  years: YearSummary[];
  stats: {
    avgAnnualPayout: number;
    sdAnnualPayout: number;
    worstYear: { year: number; payout: number };
    yearsWithPayoutPct: number;
    avgTriggerDays: number;
    avgLossDays: number;
    avgMissedLossDays: number;
    coveredLossShare: number; // share of modelled loss S$ offset by payouts
    payoutToLossOnTriggerDays: number; // insurable-interest check (should be ≤ 1)
    gaugeAgreement: number | null; // spatial basis risk: P(trigger at #1 | trigger at #2)
    byPeril: Record<Peril, number>; // avg annual S$
  };
  prepPay: {
    forecastDays: number;
    advancesPerYear: number;
    forecastAlertsPerYear: number;
    hitRate: number; // advances followed by a trigger
    triggersForewarned: number; // triggers that had an advance the evening before
    netCostPerYear: number;
  };
}

export interface Quote {
  annualPremium: number;
  weeklyPremium: number;
  dailyPremium: number;
  pctOfDailyIncome: number;
  breakdown: {
    purePremium: number;
    trendLoad: number;
    catLoad: number;
    prepPayCost: number;
    expenses: number;
    margin: number;
  };
  zoneFactor: number;
  rawZoneFactor: number;
  expectedLossRatio: number;
}
