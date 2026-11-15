import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { store } from "@/lib/data/store";
import { runBacktest } from "@/lib/engine/backtest";
import { riskCost } from "@/lib/engine/pricing";
import { DEFAULT_PRODUCT } from "@/lib/engine/product";

export const runtime = "nodejs";

type Area = { name: string; region: string; center: [number, number]; rings: [number, number][][] };
let memo: unknown = null;
let memoKey = "";

export async function GET() {
  if (memo && memoKey === store.version()) return NextResponse.json(memo);
  const areas: Area[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/generated/planning-areas.json"), "utf8"));
  const spec = DEFAULT_PRODUCT;

  // Back-tested risk at each planning area's centre → 3D skyline heights
  const areaRisk = areas.map((a) => {
    const bt = runBacktest({ lat: a.center[1], lon: a.center[0] }, spec, { includeDays: false });
    return {
      name: a.name,
      region: a.region,
      center: a.center,
      rings: a.rings,
      riskCost: Math.round(riskCost(bt, spec)),
      triggerDays: bt.stats.avgTriggerDays,
      byPeril: bt.stats.byPeril,
      station: bt.stations.rain[0]?.id ?? null,
    };
  });

  const psi = store.psi();
  const hazeYears: Record<string, { unhealthy: number; veryUnhealthy: number; peak: number }> = {};
  psi.date.forEach((d, i) => {
    const m = Math.max(...psi.regions.map((r) => psi[r][i] ?? 0));
    const y = (hazeYears[d.slice(0, 4)] ??= { unhealthy: 0, veryUnhealthy: 0, peak: 0 });
    if (m > 100) y.unhealthy++;
    if (m > 200) y.veryUnhealthy++;
    y.peak = Math.max(y.peak, m);
  });

  const stations = store.stations();
  const fc = store.forecast();
  const wb = store.wbgt();
  memo = {
    generatedAt: new Date().toISOString(),
    coverage: {
      rainStations: stations.filter((s) => s.rainDays > 2000).length,
      tempStations: stations.filter((s) => s.tempDays > 1000).length,
      wbgtStations: store.wbgtStations().length,
      rainFrom: "2014-01-01",
      rainTo: stations[0]?.to,
      psiFrom: psi.date[0],
      psiTo: psi.date.at(-1),
      forecastDays: fc?.target.length ?? 0,
      forecastFrom: fc?.target[0] ?? null,
      wbgtDays: wb?.date.length ?? 0,
      hawkerCentres: store.hawkers().length,
      stalls: store.hawkers().reduce((a, c) => a + c.stalls, 0),
    },
    climate: store.climate(),
    hazeYears,
    heatModel: store.heatModel(),
    stations: stations.map(({ id, name, lat, lon, rainDays, tempDays }) => ({ id, name, lat, lon, rainDays, tempDays })),
    wbgtStations: store.wbgtStations(),
    hawkers: store.hawkers().map(({ id, name, address, lat, lon, stalls }) => ({ id, name, address, lat, lon, stalls })),
    areas: areaRisk,
    product: spec,
  };
  memoKey = store.version();
  return NextResponse.json(memo);
}
