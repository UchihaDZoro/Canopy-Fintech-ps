// Step 2: Download MSS historical daily records for every station (resumable, cached).
// Source: http://www.weather.gov.sg/climate-historical-daily/ (Meteorological Service Singapore)
// Columns: daily rainfall total, highest 30/60/120-min rainfall, mean/max/min temperature, wind.
import fs from "node:fs";
import path from "node:path";
import { fetchRetry, pool, progressLogger, ensureDir, readJson, writeJson, RAW, OUT, sgToday } from "./lib.mjs";

const START_YEAR = Number(process.env.MSS_START_YEAR ?? 2010);
const CACHE = ensureDir(path.join(RAW, "mss"));
const stations = readJson(path.join(RAW, "stations.json"));

// Months to fetch: START_YEAR-01 .. previous month (current month is usually incomplete)
const today = sgToday();
const endY = Number(today.slice(0, 4));
const endM = Number(today.slice(5, 7)) - 1;
const months = [];
for (let y = START_YEAR; y <= endY; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === endY && m > endM) break;
    months.push(`${y}${String(m).padStart(2, "0")}`);
  }
}

// Probe which stations have MSS daily data at all (recent year), skip the rest.
console.log(`Probing ${stations.length} stations for MSS daily records...`);
const probeMonth = `${endY - 1}06`;
const probe = await pool(stations, 8, async (s) => {
  const f = path.join(CACHE, s.id, `${probeMonth}.csv`);
  if (fs.existsSync(f)) return true;
  const txt = await fetchRetry(`https://www.weather.gov.sg/files/dailydata/DAILYDATA_${s.id}_${probeMonth}.csv`).catch(() => null);
  if (txt && txt.includes("Station")) {
    ensureDir(path.dirname(f));
    fs.writeFileSync(f, txt);
    return true;
  }
  // Older stations may have closed; try an older month too
  const old = await fetchRetry(`https://www.weather.gov.sg/files/dailydata/DAILYDATA_${s.id}_201506.csv`).catch(() => null);
  return Boolean(old && old.includes("Station"));
});
const active = stations.filter((_, i) => probe[i]);
console.log(`  ${active.length} stations have MSS daily records`);

const jobs = [];
for (const s of active) for (const ym of months) jobs.push({ s, ym });
const missingMarker = (s, ym) => path.join(CACHE, s.id, `${ym}.none`);

await pool(
  jobs,
  10,
  async ({ s, ym }) => {
    const f = path.join(CACHE, s.id, `${ym}.csv`);
    if (fs.existsSync(f) || fs.existsSync(missingMarker(s, ym))) return;
    ensureDir(path.dirname(f));
    const txt = await fetchRetry(`https://www.weather.gov.sg/files/dailydata/DAILYDATA_${s.id}_${ym}.csv`).catch(() => null);
    if (txt && txt.includes("Station")) fs.writeFileSync(f, txt);
    else fs.writeFileSync(missingMarker(s, ym), "");
  },
  progressLogger("MSS station-months")
);

// Parse into compact per-station columnar series.
const num = (v) => {
  const t = (v ?? "").trim();
  if (t === "" || t === "-" || t === "—" || t === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const index = [];
for (const s of active) {
  const rows = [];
  for (const ym of months) {
    const f = path.join(CACHE, s.id, `${ym}.csv`);
    if (!fs.existsSync(f)) continue;
    // Files are latin1/UTF-8 with BOM; parse defensively
    const lines = fs.readFileSync(f, "latin1").split(/\r?\n/).slice(1);
    for (const line of lines) {
      const c = line.split(",");
      if (c.length < 8) continue;
      const y = Number(c[1]), m = Number(c[2]), d = Number(c[3]);
      if (!y || !m || !d) continue;
      rows.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        rain: num(c[4]),
        r30: num(c[5]),
        r60: num(c[6]),
        r120: num(c[7]),
        tmean: num(c[8]),
        tmax: num(c[9]),
        tmin: num(c[10]),
      });
    }
  }
  if (!rows.length) continue;
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const series = {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    date: rows.map((r) => r.date),
    rain: rows.map((r) => r.rain),
    r30: rows.map((r) => r.r30),
    r60: rows.map((r) => r.r60),
    r120: rows.map((r) => r.r120),
    tmean: rows.map((r) => r.tmean),
    tmax: rows.map((r) => r.tmax),
  };
  const validRain = series.rain.filter((v) => v !== null).length;
  const validT = series.tmax.filter((v) => v !== null).length;
  writeJson(path.join(OUT, "mss", `${s.id}.json`), series);
  index.push({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    from: series.date[0],
    to: series.date.at(-1),
    rainDays: validRain,
    tempDays: validT,
  });
}
writeJson(path.join(OUT, "stations.json"), index);
console.log(`MSS daily: ${index.length} stations parsed (${START_YEAR}-${months.at(-1)})`);
