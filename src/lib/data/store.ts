import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Region } from "@/lib/engine/types";

// Loads the pipeline outputs (src/data/generated) once per server process.
const DIR = path.join(process.cwd(), "src", "data", "generated");

function load<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as T;
}
function exists(file: string) {
  return fs.existsSync(path.join(DIR, file));
}
/** mtime of a generated file (0 if missing) — lets optional datasets hot-reload when the pipeline writes them */
function mtime(file: string) {
  try {
    return fs.statSync(path.join(DIR, file)).mtimeMs;
  } catch {
    return 0;
  }
}
const seen: Record<string, number> = {};
function fresh(file: string) {
  const m = mtime(file);
  if (seen[file] !== m) {
    seen[file] = m;
    return false;
  }
  return true;
}

export interface StationIndex {
  id: string;
  name: string;
  lat: number;
  lon: number;
  from: string;
  to: string;
  rainDays: number;
  tempDays: number;
}
export interface MssSeries {
  id: string;
  name: string;
  lat: number;
  lon: number;
  date: string[];
  rain: (number | null)[];
  r30: (number | null)[];
  r60: (number | null)[];
  r120: (number | null)[];
  tmean: (number | null)[];
  tmax: (number | null)[];
  pos: Map<string, number>;
}
export interface PsiDaily {
  regions: Region[];
  date: string[];
  north: (number | null)[];
  south: (number | null)[];
  east: (number | null)[];
  west: (number | null)[];
  central: (number | null)[];
  pos: Map<string, number>;
}
export interface WbgtDaily {
  date: string[];
  stations: Record<string, { max: (number | null)[]; hHigh: (number | null)[]; hMod: (number | null)[] }>;
  pos: Map<string, number>;
}
export interface ForecastDaily {
  regions: Region[];
  target: string[];
  high: (number | null)[];
  general: string[];
  north: number[];
  south: number[];
  east: number[];
  west: number[];
  central: number[];
  pos: Map<string, number>;
}
export interface HeatModel {
  version: string;
  target: string;
  features: string[];
  coefficients: number[];
  residualSigma: number;
  train: { n: number; r2: number; mae: number; rmse: number; from: string; to: string };
  validation: {
    n: number;
    r2: number;
    mae: number;
    rmse: number;
    from: string;
    to: string;
    highDays: { observed: number; predicted: number; hit: number };
  };
  pairs: { wbgt: string; wbgtName: string; mss: string; km: number; n: number }[];
}
export interface HawkerCentre {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  stalls: number;
  marketStalls: number;
  status: string;
  nearestStations: { id: string; km: number }[];
}
export interface ClimateLong {
  station: string;
  years: { year: number; rain: number; rainDays: number; heavy50: number; hot34: number; hot35: number; tmean: number | null }[];
}

// NEA PSI reporting-region label locations (from the data.gov.sg PSI API regionMetadata)
export const REGION_CENTROIDS: Record<Region, { lat: number; lon: number }> = {
  north: { lat: 1.41803, lon: 103.82 },
  south: { lat: 1.29587, lon: 103.82 },
  east: { lat: 1.35735, lon: 103.94 },
  west: { lat: 1.35735, lon: 103.7 },
  central: { lat: 1.35735, lon: 103.82 },
};

const withPos = <T extends { date: string[] }>(o: T) => Object.assign(o, { pos: new Map(o.date.map((d, i) => [d, i])) });

type Cache = {
  stations?: StationIndex[];
  wbgtStations?: { id: string; name: string; lat: number; lon: number }[];
  mss: Map<string, MssSeries>;
  psi?: PsiDaily;
  wbgt?: WbgtDaily | null;
  forecast?: ForecastDaily | null;
  heat?: HeatModel | null;
  hawkers?: HawkerCentre[];
  climate?: ClimateLong;
};
const g = globalThis as unknown as { __daycover?: Cache };
const cache: Cache = (g.__daycover ??= { mss: new Map() });

export const store = {
  stations: () => (cache.stations ??= load<StationIndex[]>("stations.json")),
  wbgtStations: () => (cache.wbgtStations ??= load("wbgt-stations.json")),
  mss(id: string): MssSeries {
    let s = cache.mss.get(id);
    if (!s) {
      s = withPos(load<Omit<MssSeries, "pos">>(path.join("mss", `${id}.json`)) as MssSeries);
      cache.mss.set(id, s);
    }
    return s;
  },
  psi: () => (cache.psi ??= withPos(load<Omit<PsiDaily, "pos">>("psi-daily.json") as PsiDaily)),
  wbgt(): WbgtDaily | null {
    if (cache.wbgt === undefined || !fresh("wbgt-daily.json"))
      cache.wbgt = exists("wbgt-daily.json") ? withPos(load<Omit<WbgtDaily, "pos">>("wbgt-daily.json") as WbgtDaily) : null;
    return cache.wbgt;
  },
  forecast(): ForecastDaily | null {
    if (cache.forecast === undefined || !fresh("forecast-daily.json")) {
      if (!exists("forecast-daily.json")) cache.forecast = null;
      else {
        const f = load<Omit<ForecastDaily, "pos">>("forecast-daily.json");
        cache.forecast = Object.assign(f, { pos: new Map(f.target.map((d, i) => [d, i])) }) as ForecastDaily;
      }
    }
    return cache.forecast;
  },
  heatModel(): HeatModel | null {
    if (cache.heat === undefined || !fresh("heat-model.json")) cache.heat = exists("heat-model.json") ? load<HeatModel>("heat-model.json") : null;
    return cache.heat;
  },
  /** Changes whenever an optional pipeline output is (re)written — use in cache keys */
  version: () => ["wbgt-daily.json", "forecast-daily.json", "heat-model.json"].map(mtime).join("-"),
  hawkers: () => (cache.hawkers ??= load<HawkerCentre[]>("hawker-centres.json")),
  climate: () => (cache.climate ??= load<ClimateLong>("climate-long.json")),
};
