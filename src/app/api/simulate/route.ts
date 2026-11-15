import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { store } from "@/lib/data/store";
import { selectStations } from "@/lib/engine/backtest";
import { modelledLoss } from "@/lib/engine/loss";
import { resolveProduct } from "@/lib/engine/product";
import { settle, SEVERITY } from "@/lib/engine/settle";
import type { DecisionTrace } from "@/lib/engine/explain";
import type { Peril } from "@/lib/engine/types";

export const runtime = "nodejs";

// What-if settlement: the user supplies the day's readings; the engine applies exactly the
// same rule as a real settlement (lib/engine/settle) to one stall or every stall in an area.
const Num = z.number().finite();
const Body = z.object({
  target: z.union([z.object({ kind: z.literal("centre"), id: z.string() }), z.object({ kind: z.literal("area"), name: z.string() })]),
  readings: z.object({ rain: Num.min(0).max(300), heat: Num.min(20).max(45), haze: Num.min(0).max(600) }),
  forecast: z.object({ sev: z.number().int().min(0).max(3), high: Num.min(20).max(45) }),
  usedBefore: z.object({ rain: Num.min(0).max(60), heat: Num.min(0).max(60), haze: Num.min(0).max(60) }),
  gaugeOutage: z.boolean().default(false),
  product: z.unknown().optional(),
});

type Area = { name: string; region: string; center: [number, number]; rings: [number, number][][] };
let areas: Area[] | null = null;
const loadAreas = () => (areas ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/generated/planning-areas.json"), "utf8")) as Area[]);

function inRing(lon: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;
  const spec = resolveProduct(b.product);
  const hawkers = store.hawkers().filter((h) => h.stalls > 0);

  let centres = hawkers;
  let areaName: string | null = null;
  if (b.target.kind === "centre") {
    const id = b.target.id;
    centres = hawkers.filter((h) => h.id === id);
  } else {
    const name = b.target.name;
    const a = loadAreas().find((x) => x.name === name);
    if (!a) return NextResponse.json({ error: "Unknown planning area" }, { status: 400 });
    areaName = a.name;
    centres = hawkers.filter((h) => a.rings.some((r) => inRing(h.lon, h.lat, r)));
  }
  if (!centres.length) return NextResponse.json({ error: "No hawker centres in this area" }, { status: 400 });

  const values: Record<Peril, number | null> = { rain: b.readings.rain, heat: b.readings.heat, haze: b.readings.haze };
  const forecast = { sev: b.forecast.sev, high: b.forecast.high };

  const results = centres.map((c) => {
    const st = selectStations(c, spec.stationRadiusKm);
    const s = settle(spec, { values, usedBefore: b.usedBefore, forecast });
    const gauges = st.rain.map((g, i) => ({ id: g.id, name: g.name, km: g.km, value: b.gaugeOutage && i === 0 ? null : b.readings.rain, online: !(b.gaugeOutage && i === 0), used: b.gaugeOutage ? i === 1 : i === 0 }));
    const trace: DecisionTrace = {
      mode: "simulation",
      date: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10),
      location: { lat: c.lat, lon: c.lon, label: c.name },
      region: st.region,
      gauges,
      neighbours: [],
      wbgtStation: st.wbgt ? { id: st.wbgt.id, name: st.wbgt.name, km: st.wbgt.km } : null,
      perils: s.perils.map((p) => ({
        ...p,
        source:
          p.peril === "rain"
            ? `Scenario reading at gauge ${gauges.find((g) => g.used)?.id ?? "—"}${b.gaugeOutage ? ` (nearest ${gauges[0]?.id} offline → fallback)` : ""}`
            : p.peril === "heat"
              ? `Scenario reading at NEA WBGT ${st.wbgt?.name ?? ""}`
              : `Scenario 24-h PSI, ${st.region} region`,
        probability: null,
      })),
      caps: {
        usedBefore: b.usedBefore,
        perilMax: { rain: spec.perils.rain.maxDays, heat: spec.perils.heat.maxDays, haze: spec.perils.haze.maxDays },
        totalBefore: s.totalBefore,
        totalMax: spec.maxPayableDaysPerYear,
        blocked: s.blocked,
      },
      prepPay: {
        enabled: spec.prepPay.enabled,
        forecast: { general: SEVERITY[b.forecast.sev], regionText: SEVERITY[b.forecast.sev], sev: b.forecast.sev, high: b.forecast.high, source: "scenario", issued: null },
        rule: `Send S$${(spec.prepPay.advancePct * spec.insuredDailyIncome).toFixed(0)} at 6pm if the ${st.region} region is forecast "${SEVERITY[spec.prepPay.minSeverity].toLowerCase()}" or a high ≥ ${spec.prepPay.heatForecastC}°C`,
        sent: s.sent,
        amount: s.advance,
        recoup: spec.prepPay.recoup,
      },
      rainWindow: null,
      decision: s.decision,
    };
    const loss = modelledLoss(spec.lossModel, values.rain, values.heat, values.haze) * spec.insuredDailyIncome;
    return { id: c.id, name: c.name, lat: c.lat, lon: c.lon, stalls: c.stalls, gauge: gauges.find((g) => g.used)?.id ?? null, loss: Math.round(loss * 100) / 100, trace };
  });

  const paid = results.filter((r) => r.trace.decision.verdict === "paid");
  return NextResponse.json({
    area: areaName,
    product: { insuredDailyIncome: spec.insuredDailyIncome, perils: spec.perils, prepPay: spec.prepPay, maxPayableDaysPerYear: spec.maxPayableDaysPerYear },
    results,
    summary: {
      centres: results.length,
      stalls: results.reduce((a, r) => a + r.stalls, 0),
      paidCentres: paid.length,
      perStallTransfer: paid[0]?.trace.decision.transfer ?? 0,
      advance: results[0]?.trace.prepPay.amount ?? 0,
      likelyLoss: results[0]?.loss ?? 0,
    },
  });
}
