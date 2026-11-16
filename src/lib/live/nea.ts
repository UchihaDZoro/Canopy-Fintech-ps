import "server-only";
import type { Region } from "@/lib/engine/types";

// Live NEA / MSS feeds from data.gov.sg with a small in-process cache and graceful
// fallback (the brief requires a fallback if a feed fails: we serve the last good
// snapshot and flag it as stale).

const API = "https://api-open.data.gov.sg/v2/real-time/api";
// How long a snapshot is fresh, per feed, matched to how often NEA/MSS publish
const TTL: Record<string, number> = { rain: 60_000, wbgt: 60_000, psi: 120_000, fc24: 600_000, nowcast: 300_000 };
const ttlOf = (key: string) => TTL[key.split(":")[0]] ?? 240_000;

type Entry<T> = { at: number; value: T };
type Store = { cache: Map<string, Entry<unknown>>; wire: Map<string, WireFeed>; log: WireEvent[]; rainRecs?: Map<string, Map<string, RainRec>> };
type RainRec = { timestamp: string; data: { stationId: string; value: number }[] };
const g = globalThis as unknown as { __daycoverLive?: Store };
const S: Store = (g.__daycoverLive ??= { cache: new Map(), wire: new Map(), log: [] });
const cache = S.cache;
const inflight = new Set<string>();

/* ─────────── The Data Wire: an audit log of every call the engine makes ─────────── */
export interface WireEvent {
  at: number;
  feed: string;
  endpoint: string;
  ms: number;
  status: "ok" | "error" | "rate-limited";
  bytes: number;
}
export interface WireFeed {
  feed: string;
  label: string;
  endpoint: string;
  fetchedAt: number | null;
  ms: number;
  requests: number;
  bytes: number;
  records: number;
  unit: string;
  sample: string;
  servedFrom: "network" | "cache" | "stale snapshot" | "fallback";
  error?: string;
}
type Trace = { calls: WireEvent[] };

function pushLog(e: WireEvent) {
  S.log.unshift(e);
  if (S.log.length > 60) S.log.length = 60;
}

async function getJson(url: string, feed: string, trace?: Trace) {
  const headers: Record<string, string> = { "User-Agent": "Daycover/1.0" };
  if (process.env.DATA_GOV_SG_API_KEY) headers["x-api-key"] = process.env.DATA_GOV_SG_API_KEY;
  const endpoint = url.replace("https://api-open.data.gov.sg", "").replace(/paginationToken=[^&]+/, "paginationToken=…");
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(url, { headers, cache: "no-store" });
    const text = await res.text();
    let j: { code?: number; data?: unknown; errorMsg?: string } | null = null;
    try {
      j = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    const ev: WireEvent = { at: Date.now(), feed, endpoint, ms: Date.now() - t0, status: "ok", bytes: text.length };
    if (res.status === 429 || j?.code === 24) {
      ev.status = "rate-limited";
      pushLog(ev);
      trace?.calls.push(ev);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      continue;
    }
    if (j?.code !== 0) {
      ev.status = "error";
      pushLog(ev);
      trace?.calls.push(ev);
      throw new Error(j?.errorMsg ?? `data.gov.sg error for ${endpoint}`);
    }
    pushLog(ev);
    trace?.calls.push(ev);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return j.data as any;
  }
  throw new Error(`Rate limited: ${endpoint}`);
}

type Describe<T> = (v: T) => { records: number; unit: string; sample: string };
const FEED_LABEL: Record<string, string> = {
  rain: "MSS rain gauges · 5-min totals",
  wbgt: "NEA heat stress · WBGT 15-min",
  psi: "NEA air quality · 24-h PSI",
  fc24: "NEA 24-hour forecast",
  nowcast: "NEA 2-hour nowcast",
};

async function cached<T>(key: string, fn: (trace: Trace) => Promise<T>, describe: Describe<T>): Promise<{ value: T; stale: boolean; at: number }> {
  const feed = key.split(":")[0];
  const run = async () => {
    const trace: Trace = { calls: [] };
    const t0 = Date.now();
    const value = await fn(trace);
    const d = describe(value);
    S.wire.set(feed, {
      feed,
      label: FEED_LABEL[feed] ?? feed,
      endpoint: trace.calls[0]?.endpoint ?? "",
      fetchedAt: Date.now(),
      ms: Date.now() - t0,
      requests: trace.calls.length,
      bytes: trace.calls.reduce((a, c) => a + c.bytes, 0),
      ...d,
      servedFrom: "network",
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  const mark = (from: WireFeed["servedFrom"], error?: string) => {
    const w = S.wire.get(feed);
    if (w) S.wire.set(feed, { ...w, servedFrom: from, error });
  };
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlOf(key)) {
    mark("cache");
    return { value: hit.value, stale: false, at: hit.at };
  }
  // Stale-while-revalidate: serve the last good snapshot instantly, refresh in background
  if (hit) {
    if (!inflight.has(key)) {
      inflight.add(key);
      run()
        .catch((e) => mark("stale snapshot", String(e.message ?? e)))
        .finally(() => inflight.delete(key));
    }
    mark("cache");
    return { value: hit.value, stale: Date.now() - hit.at > 3 * ttlOf(key), at: hit.at };
  }
  try {
    const value = await run();
    return { value, stale: false, at: Date.now() };
  } catch (e) {
    // Feed down on a cold start: fall back to the last snapshot of this feed (e.g. yesterday's)
    const prev = [...cache.entries()].filter(([k]) => k.split(":")[0] === feed).sort((a, b) => b[1].at - a[1].at)[0];
    if (prev) {
      mark("fallback", String((e as Error).message));
      return { value: prev[1].value as T, stale: true, at: prev[1].at };
    }
    throw e;
  }
}

export function wireSnapshot() {
  return { feeds: [...S.wire.values()], log: S.log.slice(0, 30) };
}

export function sgNow() {
  const now = new Date(Date.now() + 8 * 3600e3);
  return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours(), minute: now.getUTCMinutes(), iso: now.toISOString() };
}

export interface LiveRain {
  stations: { id: string; name: string; lat: number; lon: number }[];
  latestAt: string | null;
  perStation: Record<string, { last60: number; max60Today: number; total: number; lastValue: number; max60End: number | null }>;
  /** 5-min series per station since `tradeFrom` (epoch ms, mm) — used by receipts */
  series: Record<string, [number, number][]>;
}

/** Today's 5-min rainfall: rolling 60-min max within trading hours (from `tradeFrom`) */
export function liveRain(tradeFrom = 8) {
  const { date } = sgNow();
  return cached<LiveRain>(`rain:${date}:${tradeFrom}`, async (trace) => {
    // Incremental: the first load walks back to `tradeFrom`; later refreshes fetch only the
    // newest page (~2 h of 5-min readings) and merge it, so polling every minute stays cheap.
    const store = (S.rainRecs ??= new Map());
    const known = store.get(date) ?? new Map<string, RainRec>();
    const incremental = known.size > 0;
    let stations: LiveRain["stations"] = (cache.get(`stations:${date}`)?.value as LiveRain["stations"]) ?? [];
    let token: string | undefined;
    const fresh: RainRec[] = [];
    for (let page = 0; page < (incremental ? 1 : 12); page++) {
      const d = await getJson(`${API}/rainfall?date=${date}${token ? `&paginationToken=${encodeURIComponent(token)}` : ""}`, "rain", trace);
      if (!stations.length)
        stations = (d.stations ?? []).map((s: { id: string; name: string; location: { latitude: number; longitude: number } }) => ({
          id: s.id,
          name: s.name,
          lat: s.location.latitude,
          lon: s.location.longitude,
        }));
      fresh.push(...(d.readings ?? []));
      token = d.paginationToken;
      const oldest = fresh.at(-1)?.timestamp ?? "";
      if (!token || Number(oldest.slice(11, 13)) < tradeFrom) break;
    }
    for (const r of fresh) known.set(r.timestamp, r);
    store.set(date, known);
    for (const k of store.keys()) if (k !== date) store.delete(k); // keep only today
    if (stations.length) cache.set(`stations:${date}`, { at: Date.now(), value: stations });
    const records = [...known.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const series = new Map<string, { t: number; v: number }[]>();
    for (const r of records) {
      const t = Date.parse(r.timestamp);
      for (const x of r.data) {
        const arr = series.get(x.stationId) ?? [];
        arr.push({ t, v: Number(x.value) || 0 });
        series.set(x.stationId, arr);
      }
    }
    const perStation: LiveRain["perStation"] = {};
    const out: LiveRain["series"] = {};
    const latest = records.at(-1) ? Date.parse(records.at(-1)!.timestamp) : Date.now();
    for (const [id, arr] of series) {
      out[id] = arr.map((p) => [p.t, p.v]);
      let max60 = 0;
      let max60End: number | null = null;
      let total = 0;
      let j = 0;
      let win = 0;
      for (let i = 0; i < arr.length; i++) {
        total += arr[i].v;
        win += arr[i].v;
        while (arr[i].t - arr[j].t >= 60 * 60e3) win -= arr[j++].v;
        const h = Number(new Date(arr[i].t + 8 * 3600e3).toISOString().slice(11, 13));
        if (h >= tradeFrom && win > max60) {
          max60 = win;
          max60End = arr[i].t;
        }
      }
      const last60 = arr.filter((p) => latest - p.t < 60 * 60e3).reduce((a, p) => a + p.v, 0);
      perStation[id] = {
        last60: Math.round(last60 * 10) / 10,
        max60Today: Math.round(max60 * 10) / 10,
        total: Math.round(total * 10) / 10,
        lastValue: arr.at(-1)?.v ?? 0,
        max60End,
      };
    }
    return { stations, latestAt: records.at(-1)?.timestamp ?? null, perStation, series: out };
  }, (v) => {
    const top = Object.entries(v.perStation).sort((a, b) => b[1].max60Today - a[1].max60Today)[0];
    return {
      records: Object.keys(v.perStation).length,
      unit: "gauges",
      sample: top ? `{"stationId":"${top[0]}","wettest60min":${top[1].max60Today},"last60min":${top[1].last60},"at":"${v.latestAt?.slice(11, 16)}"}` : "{}",
    };
  });
}

export interface LiveWbgt {
  latestAt: string | null;
  perStation: Record<string, { id: string; name: string; lat: number; lon: number; latest: number; maxToday: number; heatStress: string }>;
}
export function liveWbgt() {
  const { date } = sgNow();
  return cached<LiveWbgt>(`wbgt:${date}`, async (trace) => {
    const perStation: LiveWbgt["perStation"] = {};
    let token: string | undefined;
    let latestAt: string | null = null;
    for (let page = 0; page < 6; page++) {
      const d = await getJson(`${API}/weather?api=wbgt&date=${date}${token ? `&paginationToken=${encodeURIComponent(token)}` : ""}`, "wbgt", trace);
      for (const rec of d.records ?? []) {
        latestAt ??= rec.datetime;
        for (const r of rec.item?.readings ?? []) {
          const v = Number(r.wbgt);
          if (!Number.isFinite(v)) continue;
          const s = (perStation[r.station.id] ??= {
            id: r.station.id,
            name: r.station.townCenter || r.station.name,
            lat: Number(r.location.latitude),
            lon: Number(r.location.longitude),
            latest: v,
            maxToday: v,
            heatStress: r.heatStress,
          });
          s.maxToday = Math.max(s.maxToday, v);
        }
      }
      token = d.paginationToken;
      if (!token) break;
    }
    return { latestAt, perStation };
  }, (v) => {
    const top = Object.values(v.perStation).sort((a, b) => b.maxToday - a.maxToday)[0];
    return {
      records: Object.keys(v.perStation).length,
      unit: "stations",
      sample: top ? `{"station":"${top.id}","wbgt":${top.latest},"maxToday":${top.maxToday},"heatStress":"${top.heatStress}"}` : "{}",
    };
  });
}

export interface LivePsi {
  at: string | null;
  psi24: Record<Region, number>;
  pm25: Record<Region, number> | null;
}
export function livePsi() {
  return cached<LivePsi>("psi", async (trace) => {
    const d = await getJson(`${API}/psi`, "psi", trace);
    const item = d.items?.[0];
    const r = item?.readings ?? {};
    return { at: item?.timestamp ?? null, psi24: r.psi_twenty_four_hourly, pm25: r.pm25_one_hourly ?? null };
  }, (v) => ({ records: Object.keys(v.psi24 ?? {}).length, unit: "regions", sample: JSON.stringify(v.psi24 ?? {}) }));
}

export interface LiveForecast {
  issuedAt: string | null;
  general: string;
  high: number | null;
  low: number | null;
  /** Next-day daytime outlook per region (for Prep Pay) */
  tomorrow: { date: string; text: Record<Region, string>; sev: Record<Region, number> } | null;
  source: "24-hour forecast" | "4-day outlook" | null;
  periods: { label: string; regions: Record<Region, string> }[];
}
export function severity(text = "") {
  const t = text.toLowerCase();
  if (/heavy thundery|heavy rain|heavy showers/.test(t)) return 3;
  if (/thundery/.test(t)) return 2;
  if (/showers|moderate rain|rain/.test(t)) return 1;
  return 0;
}
export function liveForecast() {
  return cached<LiveForecast>("fc24", async (trace) => {
    const d = await getJson(`${API}/twenty-four-hr-forecast`, "fc24", trace);
    const rec = d.records?.[0];
    const REG: Region[] = ["north", "south", "east", "west", "central"];
    const periods = (rec?.periods ?? []).map((p: { timePeriod: { text: string }; regions: Record<Region, { text: string }> }) => ({
      label: p.timePeriod.text,
      regions: Object.fromEntries(REG.map((r) => [r, p.regions?.[r]?.text ?? ""])) as Record<Region, string>,
    }));
    const { date } = sgNow();
    const t = new Date(date + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + 1);
    const tomorrowIso = t.toISOString().slice(0, 10);
    const tag = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const sev = Object.fromEntries(REG.map((r) => [r, 0])) as Record<Region, number>;
    const text = Object.fromEntries(REG.map((r) => [r, ""])) as Record<Region, string>;
    let found = false;
    for (const p of periods) {
      if (!/6 am to midday|midday to 6 pm/i.test(p.label) || !p.label.includes(tag)) continue;
      found = true;
      for (const r of REG) {
        const s = severity(p.regions[r]);
        if (s >= sev[r]) {
          sev[r] = s;
          text[r] = p.regions[r];
        }
      }
    }
    let source: LiveForecast["source"] = found ? "24-hour forecast" : null;
    let high: number | null = rec?.general?.temperature?.high ?? null;
    if (!found) {
      // Fallback: NEA 4-day outlook (island-wide) for tomorrow
      try {
        const o = await getJson(`${API}/four-day-outlook`, "fc24", trace);
        const f = (o.records?.[0]?.forecasts ?? []).find((x: { timestamp: string }) => x.timestamp?.startsWith(tomorrowIso));
        if (f) {
          const s = severity(`${f.forecast?.text ?? ""} ${f.forecast?.summary ?? ""}`);
          for (const r of REG) {
            sev[r] = s;
            text[r] = f.forecast?.summary || f.forecast?.text || "";
          }
          high = f.temperature?.high ?? high;
          found = true;
          source = "4-day outlook";
        }
      } catch {
        /* keep null */
      }
    }
    return {
      issuedAt: rec?.timestamp ?? null,
      general: rec?.general?.forecast?.text ?? "",
      high,
      low: rec?.general?.temperature?.low ?? null,
      tomorrow: found ? { date: tomorrowIso, text, sev } : null,
      source,
      periods,
    };
  }, (v) => ({
    records: v.periods.length,
    unit: "periods",
    sample: `{"issued":"${v.issuedAt?.slice(11, 16) ?? "-"}","general":"${v.general}","tomorrow":${JSON.stringify(v.tomorrow?.text?.east ?? null)},"via":"${v.source ?? "-"}"}`,
  }));
}

export interface Nowcast {
  validText: string;
  areas: { name: string; lat: number; lon: number; forecast: string }[];
}
export function liveNowcast() {
  return cached<Nowcast>("nowcast", async (trace) => {
    const d = await getJson(`${API}/two-hr-forecast`, "nowcast", trace);
    const meta = new Map<string, { lat: number; lon: number }>(
      (d.area_metadata ?? []).map((a: { name: string; label_location: { latitude: number; longitude: number } }) => [
        a.name,
        { lat: a.label_location.latitude, lon: a.label_location.longitude },
      ])
    );
    const item = d.items?.[0];
    return {
      validText: item?.valid_period?.text ?? "",
      areas: (item?.forecasts ?? []).map((f: { area: string; forecast: string }) => ({ name: f.area, ...meta.get(f.area)!, forecast: f.forecast })),
    };
  }, (v) => ({ records: v.areas.length, unit: "areas", sample: v.areas[0] ? `{"area":"${v.areas[0].name}","forecast":"${v.areas[0].forecast}"}` : "{}" }));
}
