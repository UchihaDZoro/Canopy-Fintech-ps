import { NextResponse } from "next/server";
import { z } from "zod";
import { store, REGION_CENTROIDS } from "@/lib/data/store";
import { runBacktest } from "@/lib/engine/backtest";
import { resolveProduct } from "@/lib/engine/product";
import { eveningForecastWithin } from "@/lib/live/forecastArchive";
import type { Peril, Region } from "@/lib/engine/types";

export const runtime = "nodejs";

// Replays one historical day across every hawker centre from the archived records and
// explains it: the rain field gauge by gauge, regional haze, the evening forecast, and
// for every centre *why* it was or wasn't paid.
const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), product: z.unknown().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const spec = resolveProduct(parsed.data.product);
  const { date } = parsed.data;
  const year = date.slice(0, 4);
  const rainT1 = spec.perils.rain.tiers[0].threshold;
  const hazeT1 = spec.perils.haze.tiers[0].threshold;
  const heatT1 = spec.perils.heat.tiers[0].threshold;

  const centres = store
    .hawkers()
    .filter((c) => c.stalls > 0)
    .map((c) => {
      // Run from 1 Jan so the yearly caps are applied exactly as they would have been
      const bt = runBacktest({ lat: c.lat, lon: c.lon }, spec, { from: `${year}-01-01`, to: date });
      const d = bt.days.at(-1);
      const paid = !!d && d.payoutPct > 0 && d.prob >= 0.5;
      let why: string;
      if (!d) why = "no record";
      else if (paid) why = d.peril === "rain" ? `rain ${d.rain} mm ≥ ${rainT1}` : d.peril === "haze" ? `PSI ${d.psi} ≥ ${hazeT1}` : `WBGT ${d.wbgt}°C ≥ ${heatT1}`;
      else if (d.capped) why = "trigger reached, yearly cap used";
      else if (d.rain === null) why = "gauge offline, no fallback in range";
      else if (d.rain >= rainT1 * 0.7) why = `close: ${d.rain} mm (needs ${rainT1})`;
      else why = `below levels: ${d.rain} mm, PSI ${d.psi ?? "—"}`;
      return {
        id: c.id,
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        stalls: c.stalls,
        region: bt.stations.region,
        station: d?.rainStation ?? null,
        rain: d?.rain ?? null,
        wbgt: d?.wbgt ?? null,
        wbgtSource: d?.wbgtSource ?? null,
        psi: d?.psi ?? null,
        peril: paid ? (d!.peril as Peril) : null,
        tier: paid ? d!.tier : 0,
        payout: paid ? Math.round(d!.payoutPct * spec.insuredDailyIncome * 100) / 100 : 0,
        prob: d?.prob ?? 0,
        capped: d?.capped ?? false,
        advance: d?.advance ?? false,
        lossPct: d?.lossPct ?? 0,
        why,
        status: paid ? "paid" : d?.capped ? "capped" : d && d.rain !== null && d.rain >= rainT1 * 0.7 ? "close" : "clear",
      };
    });

  // The rain field: every gauge's wettest hour that day
  const gauges = store
    .stations()
    .filter((s) => s.rainDays > 2000)
    .map((s) => {
      const m = store.mss(s.id);
      const i = m.pos.get(date);
      return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, r60: i === undefined ? null : m.r60[i], rain: i === undefined ? null : m.rain[i] };
    });

  const psi = store.psi();
  const pi = psi.pos.get(date);
  const regions = (Object.keys(REGION_CENTROIDS) as Region[]).map((r) => ({ region: r, ...REGION_CENTROIDS[r], psi: pi === undefined ? null : psi[r][pi] }));
  const fc = await eveningForecastWithin(date);

  const paid = centres.filter((c) => c.status === "paid");
  const byPeril: Record<string, number> = {};
  for (const c of paid) byPeril[c.peril!] = (byPeril[c.peril!] ?? 0) + 1;
  const reporting = gauges.filter((g) => g.r60 !== null);
  return NextResponse.json({
    date,
    forecast: fc ? { general: fc.general, high: fc.high, sev: fc.sev, text: fc.text, source: fc.source } : null,
    gauges,
    regions,
    centres,
    thresholds: { rain: spec.perils.rain.tiers.map((t) => t.threshold), haze: spec.perils.haze.tiers.map((t) => t.threshold), heat: spec.perils.heat.tiers.map((t) => t.threshold) },
    summary: {
      centresPaid: paid.length,
      stallsPaid: paid.reduce((a, c) => a + c.stalls, 0),
      forewarned: paid.filter((c) => c.advance).length,
      close: centres.filter((c) => c.status === "close").length,
      capped: centres.filter((c) => c.status === "capped").length,
      clear: centres.filter((c) => c.status === "clear").length,
      byPeril,
      gaugesReporting: reporting.length,
      gaugesOverT1: reporting.filter((g) => (g.r60 ?? 0) >= rainT1).length,
      wettest: reporting.sort((a, b) => (b.r60 ?? 0) - (a.r60 ?? 0)).slice(0, 5),
      maxPsi: Math.max(0, ...regions.map((r) => r.psi ?? 0)),
    },
  });
}
