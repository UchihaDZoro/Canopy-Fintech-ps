import type { BacktestResult, ProductSpec, Quote, Region, Peril } from "@/lib/engine/types";
export type { DecisionTrace } from "@/lib/engine/explain";
export type { WireFeed, WireEvent } from "@/lib/live/nea";
import type { WireFeed, WireEvent } from "@/lib/live/nea";

export type { BacktestResult, ProductSpec, Quote, Region, Peril };

export interface MetaResponse {
  coverage: {
    rainStations: number;
    tempStations: number;
    wbgtStations: number;
    rainFrom: string;
    rainTo: string;
    psiFrom: string;
    psiTo: string;
    forecastDays: number;
    forecastFrom: string | null;
    wbgtDays: number;
    hawkerCentres: number;
    stalls: number;
  };
  climate: { station: string; years: { year: number; rain: number; rainDays: number; heavy50: number; hot34: number; hot35: number; tmean: number | null }[] };
  hazeYears: Record<string, { unhealthy: number; veryUnhealthy: number; peak: number }>;
  heatModel: {
    version: string;
    features: string[];
    coefficients: number[];
    residualSigma: number;
    train: { n: number; r2: number; mae: number; from: string; to: string };
    validation: { n: number; r2: number; mae: number; rmse: number; from: string; to: string; highDays: { observed: number; predicted: number; hit: number } };
    pairs: { wbgt: string; wbgtName: string; mss: string; km: number; n: number }[];
  } | null;
  stations: { id: string; name: string; lat: number; lon: number; rainDays: number; tempDays: number }[];
  wbgtStations: { id: string; name: string; lat: number; lon: number }[];
  hawkers: { id: string; name: string; address: string; lat: number; lon: number; stalls: number }[];
  areas: {
    name: string;
    region: string;
    center: [number, number];
    rings: [number, number][][];
    riskCost: number;
    triggerDays: number;
    byPeril: Record<Peril, number>;
    station: string | null;
  }[];
  product: ProductSpec;
}

export interface BacktestResponse {
  product: ProductSpec;
  backtest: BacktestResult;
  quote: Quote;
  island: { avgRiskCost: number; avgSd: number };
  ms: number;
}

export interface PortfolioResponse {
  product: ProductSpec;
  island: { avgRiskCost: number; avgSd: number };
  totals: {
    centres: number;
    stalls: number;
    policies: number;
    premiumIncome: number;
    avgLossRatio: number;
    sdLossRatio: number;
    worstYear: { year: number; lossRatio: number; payout: number; premium: number };
  };
  years: { year: number; payout: number; premium: number; lossRatio: number; ceded: number; netLossRatio: number }[];
  topDays: { date: string; payout: number; policies: number; peril: Peril | null }[];
  stress: { psi: number; days: number; payDays: number; gross: number; lossRatio: number; ceded: number; net: number }[];
  regions: { region: Region; centres: number; stalls: number; avgWeeklyPremium: number; avgRiskCost: number; rawZoneFactor: number }[];
  centres: {
    id: string;
    name: string;
    lat: number;
    lon: number;
    stalls: number;
    region: Region;
    station: string | null;
    stationKm: number | null;
    weeklyPremium: number;
    zoneFactor: number;
    rawZoneFactor: number;
    avgAnnualPayout: number;
    avgTriggerDays: number;
    yearsWithPayoutPct: number;
    byPeril: Record<Peril, number>;
    gaugeAgreement: number | null;
  }[];
  options: { takeUp: number; stopLossAttach: number; stopLossLimit: number };
  ms: number;
}

export interface LiveCentre {
  id: string;
  name: string;
  lat: number;
  lon: number;
  stalls: number;
  region: Region;
  rain: { station: string | null; km: number | null; max60: number | null; last60: number | null };
  heat: { station: string | null; km: number | null; wbgt: number | null };
  psi: number | null;
  state: "paid" | "watch" | "clear";
  peril: Peril | null;
  tier: number;
  payout: number;
  progress: number;
  prepPay: boolean;
}

export interface LiveResponse {
  now: { date: string; hour: number; minute: number; iso: string };
  feeds: Record<string, { at: string | null; stale: boolean; stations?: number } | null>;
  errors: string[];
  rainStations: { id: string; name: string; lat: number; lon: number; last60: number; max60Today: number; total: number; lastValue: number }[];
  wbgtStations: { id: string; name: string; lat: number; lon: number; latest: number; maxToday: number; heatStress: string }[];
  psi: { at: string | null; psi24: Record<Region, number>; pm25: Record<Region, number> | null } | null;
  forecast: {
    issuedAt: string | null;
    general: string;
    high: number | null;
    low: number | null;
    tomorrow: { date: string; text: Record<Region, string>; sev: Record<Region, number> } | null;
    source: string | null;
    periods: { label: string; regions: Record<Region, string> }[];
  } | null;
  nowcast: { validText: string; areas: { name: string; lat: number; lon: number; forecast: string }[] } | null;
  centres: LiveCentre[];
  summary: { paid: number; watch: number; prepPay: number; stallsPaid: number };
  wire: { feeds: WireFeed[]; log: WireEvent[] };
}

export interface ReplayCentre {
  id: string;
  name: string;
  lat: number;
  lon: number;
  stalls: number;
  region: Region;
  station: string | null;
  rain: number | null;
  wbgt: number | null;
  wbgtSource: string | null;
  psi: number | null;
  peril: Peril | null;
  tier: number;
  payout: number;
  prob: number;
  capped: boolean;
  advance: boolean;
  lossPct: number;
  why: string;
  status: "paid" | "capped" | "close" | "clear";
}
export interface ReplayResponse {
  date: string;
  forecast: { general: string; high: number | null; sev: Record<Region, number>; text: Record<Region, string>; source: string } | null;
  gauges: { id: string; name: string; lat: number; lon: number; r60: number | null; rain: number | null }[];
  regions: { region: Region; lat: number; lon: number; psi: number | null }[];
  centres: ReplayCentre[];
  thresholds: { rain: number[]; haze: number[]; heat: number[] };
  summary: {
    centresPaid: number;
    stallsPaid: number;
    forewarned: number;
    close: number;
    capped: number;
    clear: number;
    byPeril: Record<string, number>;
    gaugesReporting: number;
    gaugesOverT1: number;
    wettest: { id: string; name: string; r60: number | null }[];
    maxPsi: number;
  };
}
