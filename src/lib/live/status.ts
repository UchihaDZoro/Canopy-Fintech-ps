import "server-only";
import { store } from "@/lib/data/store";
import { nearestRegion } from "@/lib/engine/backtest";
import { haversineKm, round } from "@/lib/engine/math";
import type { Peril, ProductSpec, Region, Tier } from "@/lib/engine/types";
import { liveForecast, livePsi, liveRain, liveWbgt, liveNowcast, sgNow, wireSnapshot } from "./nea";

export interface CentreStatus {
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
  progress: number; // 0..1 towards tier-1 of the closest peril
  prepPay: boolean;
}

function tierOf(v: number | null, tiers: Tier[]): [number, number] {
  if (v === null) return [0, 0];
  let t = 0, pct = 0;
  tiers.forEach((x, i) => {
    if (v >= x.threshold && x.payoutPct >= pct) {
      t = i + 1;
      pct = x.payoutPct;
    }
  });
  return [t, pct];
}

export async function liveStatus(spec: ProductSpec) {
  const errors: string[] = [];
  const settle = async <T,>(name: string, p: Promise<T>) => {
    try {
      return await p;
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      return null;
    }
  };
  const [rain, wbgt, psi, fc, now2h] = await Promise.all([
    settle("rainfall", liveRain(8)),
    settle("wbgt", liveWbgt()),
    settle("psi", livePsi()),
    settle("forecast", liveForecast()),
    settle("nowcast", liveNowcast()),
  ]);

  const rainStations = (rain?.value.stations ?? []).filter((s) => rain?.value.perStation[s.id]);
  const wbgtStations = Object.values(wbgt?.value.perStation ?? {});
  const t1 = (tiers: Tier[]) => Math.min(...tiers.map((t) => t.threshold));

  const centres: CentreStatus[] = store
    .hawkers()
    .filter((c) => c.stalls > 0)
    .map((c) => {
      const region = nearestRegion(c);
      // Nearest *reporting* gauge (fallback is automatic: offline gauges are skipped)
      const rs = rainStations
        .map((s) => ({ s, km: haversineKm(c, s) }))
        .filter((x) => x.km <= spec.stationRadiusKm)
        .sort((a, b) => a.km - b.km)[0];
      const rv = rs ? rain!.value.perStation[rs.s.id] : null;
      const ws = wbgtStations.map((s) => ({ s, km: haversineKm(c, s) })).sort((a, b) => a.km - b.km)[0];
      const heatV = ws ? round(ws.s.maxToday + spec.perils.heat.siteOffset, 1) : null;
      const psiV = psi?.value.psi24?.[region] ?? null;

      const cands: [Peril, number, number, number][] = [];
      if (spec.perils.rain.enabled) {
        const [t, p] = tierOf(rv?.max60Today ?? null, spec.perils.rain.tiers);
        cands.push(["rain", p, t, (rv?.max60Today ?? 0) / t1(spec.perils.rain.tiers)]);
      }
      if (spec.perils.heat.enabled) {
        const [t, p] = tierOf(heatV, spec.perils.heat.tiers);
        // progress from the "Low" band (29°C) to tier-1
        cands.push(["heat", p, t, heatV === null ? 0 : (heatV - 29) / (t1(spec.perils.heat.tiers) - 29)]);
      }
      if (spec.perils.haze.enabled) {
        const [t, p] = tierOf(psiV, spec.perils.haze.tiers);
        cands.push(["haze", p, t, (psiV ?? 0) / t1(spec.perils.haze.tiers)]);
      }
      cands.sort((a, b) => b[1] - a[1] || b[3] - a[3]);
      const top = cands[0];
      const paid = top && top[1] > 0;
      const progress = Math.max(0, Math.min(1, top?.[3] ?? 0));
      const sev = fc?.value.tomorrow?.sev[region] ?? 0;
      const prepPay =
        spec.prepPay.enabled &&
        (sev >= spec.prepPay.minSeverity || (spec.perils.heat.enabled && (fc?.value.high ?? 0) >= spec.prepPay.heatForecastC));
      return {
        id: c.id,
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        stalls: c.stalls,
        region,
        rain: { station: rs?.s.id ?? null, km: rs ? round(rs.km, 2) : null, max60: rv?.max60Today ?? null, last60: rv?.last60 ?? null },
        heat: { station: ws?.s.id ?? null, km: ws ? round(ws.km, 2) : null, wbgt: heatV },
        psi: psiV,
        state: paid ? "paid" : progress >= 0.6 ? "watch" : "clear",
        peril: paid || progress >= 0.6 ? top[0] : null,
        tier: paid ? top[2] : 0,
        payout: paid ? round(top[1] * spec.insuredDailyIncome) : 0,
        progress: round(progress, 3),
        prepPay,
      };
    });

  return {
    now: sgNow(),
    feeds: {
      rain: rain ? { at: rain.value.latestAt, stale: rain.stale, stations: rainStations.length } : null,
      wbgt: wbgt ? { at: wbgt.value.latestAt, stale: wbgt.stale, stations: wbgtStations.length } : null,
      psi: psi ? { at: psi.value.at, stale: psi.stale } : null,
      forecast: fc ? { at: fc.value.issuedAt, stale: fc.stale } : null,
    },
    errors,
    wire: wireSnapshot(),
    rainStations: rainStations.map((s) => ({ ...s, ...rain!.value.perStation[s.id] })),
    wbgtStations,
    psi: psi?.value ?? null,
    forecast: fc?.value ?? null,
    nowcast: now2h?.value ?? null,
    centres,
    summary: {
      paid: centres.filter((c) => c.state === "paid").length,
      watch: centres.filter((c) => c.state === "watch").length,
      prepPay: centres.filter((c) => c.prepPay).length,
      stallsPaid: centres.filter((c) => c.state === "paid").reduce((a, c) => a + c.stalls, 0),
    },
  };
}
