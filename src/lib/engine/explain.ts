import "server-only";
import { store } from "@/lib/data/store";
import { eveningForecastWithin } from "@/lib/live/forecastArchive";
import { liveRain, livePsi, liveWbgt, sgNow } from "@/lib/live/nea";
import { runBacktest, selectStations } from "./backtest";
import { haversineKm, round } from "./math";
import { settle, SEVERITY as SEV } from "./settle";
import type { Location, Peril, ProductSpec, Region } from "./types";

/**
 * A decision trace ("receipt"): every step the engine takes to decide one stall's payout
 * on one day, in the order a person would check it.
 */
export interface DecisionTrace {
  mode: "live" | "history" | "simulation";
  date: string;
  location: Location & { label?: string };
  region: Region;
  gauges: { id: string; name: string; km: number; value: number | null; online: boolean; used: boolean }[];
  neighbours: { id: string; name: string; lat: number; lon: number; km: number; value: number | null }[];
  wbgtStation: { id: string; name: string; km: number } | null;
  perils: {
    peril: Peril;
    enabled: boolean;
    value: number | null;
    unit: string;
    source: string;
    tiers: { threshold: number; amount: number; reached: boolean }[];
    tier: number;
    amount: number;
    probability: number | null; // for reconstructed heat
  }[];
  caps: { usedBefore: Record<Peril, number>; perilMax: Record<Peril, number>; totalBefore: number; totalMax: number; blocked: boolean };
  prepPay: {
    enabled: boolean;
    forecast: { general: string; regionText: string; sev: number; high: number | null; source: string; issued: string | null } | null;
    rule: string;
    sent: boolean;
    amount: number;
    recoup: boolean;
  };
  rainWindow: { series: [number, number][]; start: number | null; end: number | null; max60: number; threshold: number } | null;
  decision: { peril: Peril | null; tier: number; gross: number; advanceDeducted: number; transfer: number; verdict: "paid" | "not-paid" | "capped"; headline: string; reasons: string[] };
}

export async function explainDay(loc: Location & { label?: string }, date: string, spec: ProductSpec): Promise<DecisionTrace> {
  const income = spec.insuredDailyIncome;
  const today = sgNow().date;
  const mode: DecisionTrace["mode"] = date >= today ? "live" : "history";
  const st = selectStations(loc, spec.stationRadiusKm);
  const region = st.region;

  // Year-to-date cap usage from the back-test (expected trigger days already used this year)
  const lastHist = store.mss(st.rain[0]?.id ?? store.stations()[0].id).date.at(-1)!;
  const ytdTo = mode === "live" ? lastHist : prevDay(date);
  const year = date.slice(0, 4);
  const usedBefore: Record<Peril, number> = { rain: 0, heat: 0, haze: 0 };
  if (ytdTo >= `${year}-01-01`) {
    const ytd = runBacktest(loc, spec, { from: `${year}-01-01`, to: ytdTo < date ? ytdTo : prevDay(date) });
    for (const d of ytd.days) if (d.payoutPct > 0 && d.peril) usedBefore[d.peril] += d.prob;
  }
  const totalBefore = usedBefore.rain + usedBefore.heat + usedBefore.haze;

  // ── Readings ──
  const gauges: DecisionTrace["gauges"] = [];
  let rainV: number | null = null;
  let rainSrc = "";
  let rainWindow: DecisionTrace["rainWindow"] = null;
  let wbgtV: number | null = null;
  let wbgtSrc = "";
  let heatProb: number | null = null;
  let psiV: number | null = null;
  let psiSrc = "";
  const neighbours: DecisionTrace["neighbours"] = [];

  if (mode === "live") {
    const [rain, wb, psi] = await Promise.all([liveRain(8).catch(() => null), liveWbgt().catch(() => null), livePsi().catch(() => null)]);
    const rs = (rain?.value.stations ?? []).map((s) => ({ ...s, km: haversineKm(loc, s) })).sort((a, b) => a.km - b.km);
    for (const s of rs.filter((x) => x.km <= spec.stationRadiusKm).slice(0, 4)) {
      const v = rain!.value.perStation[s.id];
      const online = !!v;
      gauges.push({ id: s.id, name: s.name, km: round(s.km, 2), value: v ? v.max60Today : null, online, used: false });
    }
    for (const s of rs.filter((x) => x.km <= 6)) {
      const v = rain!.value.perStation[s.id];
      neighbours.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, km: round(s.km, 2), value: v ? v.max60Today : null });
    }
    const used = gauges.find((x) => x.online);
    if (used) {
      used.used = true;
      rainV = used.value;
      const p = rain!.value.perStation[used.id];
      const series = rain!.value.series[used.id] ?? [];
      rainWindow = { series, end: p.max60End, start: p.max60End ? p.max60End - 55 * 60e3 : null, max60: p.max60Today, threshold: spec.perils.rain.tiers[0].threshold };
      rainSrc = `MSS gauge ${used.id}, 5-min totals since 08:00, wettest rolling hour`;
    }
    const ws = Object.values(wb?.value.perStation ?? {}).map((s) => ({ ...s, km: haversineKm(loc, s) })).sort((a, b) => a.km - b.km)[0];
    if (ws) {
      wbgtV = round(ws.maxToday + spec.perils.heat.siteOffset, 1);
      wbgtSrc = `NEA WBGT ${ws.name} (${round(ws.km, 1)} km), highest 15-min reading today`;
    }
    psiV = psi?.value.psi24?.[region] ?? null;
    psiSrc = `NEA 24-h PSI, ${region} region, latest hourly`;
  } else {
    const bt = runBacktest(loc, spec, { from: date, to: date });
    const d = bt.days[0];
    for (const s of st.rain) {
      const m = store.mss(s.id);
      const i = m.pos.get(date);
      const v = i === undefined ? null : m.r60[i];
      gauges.push({ id: s.id, name: s.name, km: s.km, value: v ?? null, online: v !== null && v !== undefined, used: d?.rainStation === s.id });
    }
    for (const s of store.stations().filter((x) => x.rainDays > 2000)) {
      const km = haversineKm(loc, s);
      if (km > 6) continue;
      const m = store.mss(s.id);
      const i = m.pos.get(date);
      neighbours.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, km: round(km, 2), value: i === undefined ? null : m.r60[i] });
    }
    rainV = d?.rain ?? null;
    rainSrc = d?.rainStation ? `MSS daily record, gauge ${d.rainStation}: highest 60-min rainfall` : "no gauge reported";
    wbgtV = d?.wbgt ?? null;
    wbgtSrc =
      d?.wbgtSource === "observed"
        ? `NEA WBGT ${st.wbgt?.name ?? ""}, daily maximum`
        : d?.wbgtSource === "modelled"
          ? `Reconstructed from MSS temperatures (WBGT network began Feb 2025)`
          : "no reading";
    if (d?.wbgtSource === "modelled" && d.peril === "heat") heatProb = d.prob;
    psiV = d?.psi ?? null;
    psiSrc = `NEA historical 24-h PSI, ${region} region, daily maximum`;
  }
  neighbours.sort((a, b) => a.km - b.km);

  // ── Settle with the shared rule (same function the simulator uses) ──
  const fc = await eveningForecastWithin(date);
  const sev = fc ? fc.sev[region] : 0;
  const s = settle(spec, { values: { rain: rainV, heat: wbgtV, haze: psiV }, usedBefore, forecast: fc ? { sev, high: fc.high } : null });
  const SRC: Record<Peril, string> = { rain: rainSrc, heat: wbgtSrc, haze: psiSrc };
  const perils: DecisionTrace["perils"] = s.perils.map((p) => ({ ...p, source: SRC[p.peril], probability: p.peril === "heat" ? heatProb : null }));
  const { blocked, sent, advance } = s;

  return {
    mode,
    date,
    location: loc,
    region,
    gauges,
    neighbours: neighbours.slice(0, 14),
    wbgtStation: st.wbgt ? { id: st.wbgt.id, name: st.wbgt.name, km: st.wbgt.km } : null,
    perils,
    caps: {
      usedBefore: { rain: round(usedBefore.rain, 2), heat: round(usedBefore.heat, 2), haze: round(usedBefore.haze, 2) },
      perilMax: { rain: spec.perils.rain.maxDays, heat: spec.perils.heat.maxDays, haze: spec.perils.haze.maxDays },
      totalBefore: round(totalBefore, 2),
      totalMax: spec.maxPayableDaysPerYear,
      blocked,
    },
    prepPay: {
      enabled: spec.prepPay.enabled,
      forecast: fc
        ? { general: fc.general, regionText: fc.text[region] || SEV[sev], sev, high: fc.high, source: fc.source, issued: fc.issued }
        : null,
      rule: `Send ${fmt(spec.prepPay.advancePct * income)} at 6pm if the ${region} region is forecast "${SEV[spec.prepPay.minSeverity].toLowerCase()}"${spec.perils.heat.enabled ? ` or a high ≥ ${spec.prepPay.heatForecastC}°C` : ""}`,
      sent,
      amount: advance,
      recoup: spec.prepPay.recoup,
    },
    rainWindow,
    decision: s.decision,
  };
}

function prevDay(d: string) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}
const fmt = (v: number) => `S$${Number.isInteger(v) ? v : v.toFixed(2)}`;
