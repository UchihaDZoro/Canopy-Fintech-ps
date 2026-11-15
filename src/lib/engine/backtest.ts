import "server-only";
import { store, REGION_CENTROIDS, type MssSeries } from "@/lib/data/store";
import { dayIter, haversineKm, mean, normCdf, round, sd } from "./math";
import { modelledLoss } from "./loss";
import type {
  BacktestResult,
  DayResult,
  Location,
  Peril,
  ProductSpec,
  Region,
  StationRef,
  Tier,
  YearSummary,
} from "./types";

export const BACKTEST_FROM = "2014-01-01";

/** Highest tier reached by a deterministic index value → [tierIndex+1, payoutPct] */
function tierFor(value: number | null, tiers: Tier[]): [number, number] {
  if (value === null) return [0, 0];
  let t = 0;
  let pct = 0;
  tiers.forEach((tier, i) => {
    if (value >= tier.threshold && tier.payoutPct >= pct) {
      t = i + 1;
      pct = tier.payoutPct;
    }
  });
  return [t, pct];
}

/** Expected payout when the index is a model estimate with Gaussian error */
function expectedTierPct(estimate: number, sigma: number, tiers: Tier[]) {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let prev = 0;
  let ev = 0;
  for (const t of sorted) {
    const p = 1 - normCdf((t.threshold - estimate) / sigma);
    ev += p * Math.max(0, t.payoutPct - prev);
    prev = Math.max(prev, t.payoutPct);
  }
  return ev;
}

export { modelledLoss };

export function nearestRegion(loc: Location): Region {
  let best: Region = "central";
  let bestKm = Infinity;
  for (const [r, c] of Object.entries(REGION_CENTROIDS) as [Region, { lat: number; lon: number }][]) {
    const km = haversineKm(loc, c);
    if (km < bestKm) {
      bestKm = km;
      best = r;
    }
  }
  return best;
}

export function selectStations(loc: Location, radiusKm: number) {
  const all = store.stations();
  const withKm = all.map((s) => ({ ...s, km: haversineKm(loc, s) })).sort((a, b) => a.km - b.km);
  const ref = (s: (typeof withKm)[number]): StationRef => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, km: round(s.km, 2) });
  let rain = withKm.filter((s) => s.rainDays > 2000 && s.km <= radiusKm).slice(0, 4);
  if (!rain.length) rain = withKm.filter((s) => s.rainDays > 2000).slice(0, 1);
  const temp = withKm.find((s) => s.tempDays > 1000);
  const wb = store
    .wbgtStations()
    .map((s) => ({ ...s, km: haversineKm(loc, s) }))
    .sort((a, b) => a.km - b.km)[0];
  return {
    rain: rain.map(ref),
    temp: temp ? ref(temp) : null,
    wbgt: wb ? { id: wb.id, name: wb.name, lat: wb.lat, lon: wb.lon, km: round(wb.km, 2) } : null,
    region: nearestRegion(loc),
  };
}

export interface BacktestOptions {
  from?: string;
  to?: string;
  includeDays?: boolean;
}

export function runBacktest(loc: Location, spec: ProductSpec, opts: BacktestOptions = {}): BacktestResult {
  const st = selectStations(loc, spec.stationRadiusKm);
  const rainSeries: MssSeries[] = st.rain.map((s) => store.mss(s.id));
  const tempSeries = st.temp ? store.mss(st.temp.id) : null;
  const psi = store.psi();
  const wbgt = store.wbgt();
  const wbgtSeries = st.wbgt && wbgt ? wbgt.stations[st.wbgt.id] : undefined;
  const heatModel = store.heatModel();
  const fc = store.forecast();
  const income = spec.insuredDailyIncome;

  const lastDate = rainSeries[0]?.date.at(-1) ?? BACKTEST_FROM;
  const from = opts.from ?? BACKTEST_FROM;
  const to = opts.to ?? lastDate;

  const days: DayResult[] = [];
  const yearMap = new Map<number, YearSummary>();
  let agreeBoth = 0;
  let agreeSecond = 0;
  const tier1Rain = Math.min(...spec.perils.rain.tiers.map((t) => t.threshold));

  // Prep Pay accounting (only on days with an archived evening forecast)
  const expTriggers: Record<number, number> = {};
  const perilUsed: Record<number, Record<Peril, number>> = {};
  let fcDays = 0, advances = 0, advanceHits = 0, fcTriggers = 0, fcTriggersWarned = 0;
  const yrAdv: Record<number, number> = {};
  const yrFc: Record<number, number> = {};

  for (const date of dayIter(from, to)) {
    const year = Number(date.slice(0, 4));
    const Y =
      yearMap.get(year) ??
      ({ year, days: 0, triggerDays: 0, payout: 0, advances: 0, lossDays: 0, missedLossDays: 0, lossAmount: 0, byPeril: { rain: 0, heat: 0, haze: 0 } } as YearSummary);
    yearMap.set(year, Y);
    Y.days++;

    // ---- Rain: nearest working gauge, with automatic fallback to the next one ----
    let rain: number | null = null;
    let rainStation: string | null = null;
    for (const s of rainSeries) {
      const i = s.pos.get(date);
      const v = i === undefined ? null : s.r60[i];
      if (v !== null && v !== undefined) {
        rain = v;
        rainStation = s.id;
        break;
      }
    }
    if (rainSeries.length > 1) {
      const i1 = rainSeries[0].pos.get(date);
      const i2 = rainSeries[1].pos.get(date);
      const v1 = i1 === undefined ? null : rainSeries[0].r60[i1];
      const v2 = i2 === undefined ? null : rainSeries[1].r60[i2];
      if (v1 != null && v2 != null && v2 >= tier1Rain) {
        agreeSecond++;
        if (v1 >= tier1Rain) agreeBoth++;
      }
    }

    // ---- Heat: observed WBGT where it exists, else the calibrated model ----
    let wbgtV: number | null = null;
    let wbgtSource: DayResult["wbgtSource"] = null;
    let heatPct = 0;
    let heatTier = 0;
    let heatProb = 0; // probability the heat trigger is reached
    const wi = wbgt?.pos.get(date);
    const obs = wi !== undefined && wbgtSeries ? wbgtSeries.max[wi] : null;
    if (obs !== null && obs !== undefined) {
      wbgtV = obs + spec.perils.heat.siteOffset;
      wbgtSource = "observed";
      [heatTier, heatPct] = tierFor(wbgtV, spec.perils.heat.tiers);
      heatProb = heatTier > 0 ? 1 : 0;
    } else if (heatModel && tempSeries) {
      const ti = tempSeries.pos.get(date);
      const tmax = ti === undefined ? null : tempSeries.tmax[ti];
      const tmean = ti === undefined ? null : tempSeries.tmean[ti];
      if (tmax != null && tmean != null) {
        const doy = (Date.parse(date) - Date.parse(date.slice(0, 4) + "-01-01")) / 864e5;
        const a = (2 * Math.PI * doy) / 365.25;
        const x = [1, tmax, tmean, Math.log1p(tempSeries.rain[ti!] ?? 0), Math.sin(a), Math.cos(a)];
        const est = x.reduce((s, v, k) => s + v * heatModel.coefficients[k], 0) + spec.perils.heat.siteOffset;
        wbgtV = round(est, 2);
        wbgtSource = "modelled";
        heatTier = tierFor(est, spec.perils.heat.tiers)[0];
        heatPct = expectedTierPct(est, heatModel.residualSigma, spec.perils.heat.tiers);
        const t1 = Math.min(...spec.perils.heat.tiers.map((t) => t.threshold));
        heatProb = 1 - normCdf((t1 - est) / heatModel.residualSigma);
      }
    }

    // ---- Haze: regional 24-h PSI (daily max) ----
    const pi = psi.pos.get(date);
    const psiV = pi === undefined ? null : psi[st.region][pi];

    const [rainTier, rainPct] = spec.perils.rain.enabled ? tierFor(rain, spec.perils.rain.tiers) : [0, 0];
    if (!spec.perils.heat.enabled) {
      heatPct = 0;
      heatTier = 0;
      heatProb = 0;
    }
    const [hazeTier, hazePct] = spec.perils.haze.enabled ? tierFor(psiV, spec.perils.haze.tiers) : [0, 0];

    // Perils pool: the day pays the highest single peril (no stacking)
    const cands: [Peril, number, number][] = [
      ["rain", rainPct, rainTier],
      ["heat", heatPct, heatTier],
      ["haze", hazePct, hazeTier],
    ];
    // Probability each peril's trigger is reached: 1 for observed indices,
    // P(WBGT ≥ tier-1) when heat is reconstructed by the model.
    const probOf: Record<Peril, number> = { rain: rainTier > 0 ? 1 : 0, heat: heatProb, haze: hazeTier > 0 ? 1 : 0 };
    const used = (perilUsed[year] ??= { rain: 0, heat: 0, haze: 0 });
    expTriggers[year] ??= 0;
    // Caps count *expected* trigger days (near-miss modelled heat days cost only their probability).
    // A peril that has used its own cap drops out; the overall cap applies on top.
    const open = cands.filter(([p, pct]) => pct > 0 && used[p] < spec.perils[p].maxDays).sort((a, b) => b[1] - a[1]);
    const anyTrig = cands.some(([, pct]) => pct > 0);
    let capped = false;
    let peril: Peril = cands.sort((a, b) => b[1] - a[1])[0][0];
    let payoutPct = 0;
    let tier = 0;
    let prob = 0;
    if (open.length && expTriggers[year] < spec.maxPayableDaysPerYear) {
      [peril, payoutPct, tier] = open[0];
      prob = probOf[peril];
      used[peril] += prob;
      expTriggers[year] += prob;
    } else if (anyTrig) {
      prob = Math.max(probOf.rain, probOf.heat, probOf.haze);
      capped = prob >= 0.5;
    }
    const isTrigger = payoutPct > 0 && prob >= 0.5;

    // ---- Prep Pay: evening-before forecast for this region ----
    let advance = false;
    const fi = fc?.pos.get(date);
    if (fc && fi !== undefined) {
      fcDays++;
      yrFc[year] = (yrFc[year] ?? 0) + 1;
      const sev = fc[st.region][fi];
      const high = fc.high[fi];
      advance =
        spec.prepPay.enabled &&
        (sev >= spec.prepPay.minSeverity || (spec.perils.heat.enabled && high !== null && high >= spec.prepPay.heatForecastC));
      if (isTrigger) {
        fcTriggers++;
        if (advance) fcTriggersWarned++;
      }
      if (advance) {
        advances++;
        if (isTrigger) advanceHits++;
        yrAdv[year] = (yrAdv[year] ?? 0) + 1;
      }
    }

    const lossPct = modelledLoss(spec.lossModel, rain, wbgtV, psiV);
    const lossDay = lossPct >= spec.lossModel.lossDayThreshold;
    const payout = payoutPct * income;
    Y.payout += payout;
    if (payout > 0) Y.byPeril[peril] += payout;
    Y.lossAmount += lossPct * income;
    if (lossDay) {
      Y.lossDays++;
      if (!isTrigger) Y.missedLossDays++;
    }

    days.push({
      date,
      rain,
      rainStation,
      wbgt: wbgtV === null ? null : round(wbgtV, 1),
      wbgtSource,
      psi: psiV ?? null,
      payoutPct: round(payoutPct, 4),
      prob: round(payoutPct > 0 || capped ? prob : 0, 3),
      peril: isTrigger || capped ? peril : payoutPct > 0 ? peril : null,
      tier: isTrigger || capped ? Math.max(1, tier) : 0,
      capped,
      advance,
      lossPct: round(lossPct, 3),
      lossDay,
    });
  }

  // Prep Pay cost per year. Forecasts are sampled, so advances are annualised per year and
  // capped at `maxPerYear`. In "recoup" mode an advance is deducted from the customer's next
  // payout(s) that year (never owed back), so the insurer only bears what payouts don't cover.
  const hitRate = advances ? advanceHits / advances : 0;
  let prepYears = 0, prepAdvSum = 0, prepCostSum = 0;
  for (const Y of yearMap.values()) {
    const f = yrFc[Y.year] ?? 0;
    if (!f || !spec.prepPay.enabled) continue;
    const A = Math.min(spec.prepPay.maxPerYear, ((yrAdv[Y.year] ?? 0) * Y.days) / f);
    const outlay = A * spec.prepPay.advancePct * income;
    const cost = spec.prepPay.recoup ? Math.max(0, outlay - Y.payout) : outlay * (1 - hitRate);
    Y.advances = cost;
    const w = Y.days / 365.25;
    prepYears += w;
    prepAdvSum += A;
    prepCostSum += cost;
  }

  const years = [...yearMap.values()].map((y) => ({
    ...y,
    triggerDays: round(expTriggers[y.year] ?? 0, 1),
    payout: round(y.payout),
    advances: round(y.advances),
    lossAmount: round(y.lossAmount),
    byPeril: { rain: round(y.byPeril.rain), heat: round(y.byPeril.heat), haze: round(y.byPeril.haze) },
  }));
  const totalDays = days.length;
  const yearsCovered = totalDays / 365.25;
  // Annualised per-year payouts (partial years scaled) for volatility
  const fullYears = years.filter((y) => y.days >= 330);
  const annual = fullYears.map((y) => (y.payout * 365.25) / y.days);
  const totalPayout = years.reduce((a, y) => a + y.payout, 0);
  const totalLoss = years.reduce((a, y) => a + y.lossAmount, 0);
  const sumP = (p: Peril) => years.reduce((a, y) => a + y.byPeril[p], 0) / yearsCovered;

  let trigLossSum = 0;
  let trigPaySum = 0;
  for (const d of days) {
    if (d.payoutPct > 0) {
      trigLossSum += d.lossPct;
      trigPaySum += d.payoutPct;
    }
  }
  const worst = fullYears.reduce((w, y) => (y.payout > w.payout ? y : w), fullYears[0] ?? years[0]);

  return {
    location: loc,
    stations: st,
    period: { from, to, years: round(yearsCovered, 2) },
    days: opts.includeDays === false ? [] : days,
    years,
    stats: {
      avgAnnualPayout: round(totalPayout / yearsCovered),
      sdAnnualPayout: round(sd(annual)),
      worstYear: { year: worst?.year ?? 0, payout: round(worst?.payout ?? 0) },
      yearsWithPayoutPct: round(fullYears.filter((y) => y.payout > 0).length / Math.max(1, fullYears.length), 3),
      avgTriggerDays: round(years.reduce((a, y) => a + y.triggerDays, 0) / yearsCovered, 2),
      avgLossDays: round(years.reduce((a, y) => a + y.lossDays, 0) / yearsCovered, 2),
      avgMissedLossDays: round(years.reduce((a, y) => a + y.missedLossDays, 0) / yearsCovered, 2),
      coveredLossShare: round(totalLoss ? totalPayout / totalLoss : 0, 3),
      payoutToLossOnTriggerDays: round(trigLossSum ? trigPaySum / trigLossSum : 0, 3),
      gaugeAgreement: agreeSecond >= 5 ? round(agreeBoth / agreeSecond, 3) : null,
      byPeril: { rain: round(sumP("rain")), heat: round(sumP("heat")), haze: round(sumP("haze")) },
    },
    prepPay: {
      forecastDays: fcDays,
      forecastAlertsPerYear: fcDays ? round((advances / fcDays) * 365.25, 1) : 0,
      advancesPerYear: prepYears ? round(prepAdvSum / prepYears, 1) : 0,
      hitRate: round(hitRate, 3),
      triggersForewarned: fcTriggers ? round(fcTriggersWarned / fcTriggers, 3) : 0,
      netCostPerYear: prepYears ? round(prepCostSum / prepYears) : 0,
    },
  };
}

export { mean };
