// Step 7: Long-run climate signal at Changi (MSS reference station S24), 1981 → present.
// Produces annual counts of extreme days, used for the climate-trend loading in pricing
// and for the "Singapore is getting hotter and wetter" visual.
import fs from "node:fs";
import path from "node:path";
import { fetchRetry, pool, ensureDir, writeJson, progressLogger, RAW, OUT, sgToday } from "./lib.mjs";

const ID = process.env.LONG_STATION ?? "S24";
const CACHE = ensureDir(path.join(RAW, "mss", ID));
const endY = Number(sgToday().slice(0, 4));
const months = [];
for (let y = 1981; y <= endY; y++) for (let m = 1; m <= 12; m++) months.push(`${y}${String(m).padStart(2, "0")}`);

await pool(
  months,
  8,
  async (ym) => {
    const f = path.join(CACHE, `${ym}.csv`);
    if (fs.existsSync(f) || fs.existsSync(f.replace(".csv", ".none"))) return;
    const txt = await fetchRetry(`https://www.weather.gov.sg/files/dailydata/DAILYDATA_${ID}_${ym}.csv`).catch(() => null);
    if (txt && txt.includes("Station")) fs.writeFileSync(f, txt);
    else fs.writeFileSync(f.replace(".csv", ".none"), "");
  },
  progressLogger(`${ID} months`)
);

const num = (v) => {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};
const years = {};
for (const ym of months) {
  const f = path.join(CACHE, `${ym}.csv`);
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "latin1").split(/\r?\n/).slice(1)) {
    const c = line.split(",");
    if (c.length < 10) continue;
    const y = Number(c[1]);
    if (!y) continue;
    const Y = (years[y] ??= { year: y, days: 0, rain: 0, heavy50: 0, rainDays: 0, hot34: 0, hot35: 0, tmeanSum: 0, tmeanN: 0 });
    Y.days++;
    const rain = num(c[4]);
    const r60 = num(c[6]);
    const tmean = num(c[8]);
    const tmax = num(c[9]);
    if (rain !== null) {
      Y.rain += rain;
      if (rain >= 1) Y.rainDays++;
    }
    if (rain !== null && rain >= 50) Y.heavy50++;
    if (tmax !== null && tmax >= 34) Y.hot34++;
    if (tmax !== null && tmax >= 35) Y.hot35++;
    if (tmean !== null) {
      Y.tmeanSum += tmean;
      Y.tmeanN++;
    }
  }
}
const list = Object.values(years)
  .filter((y) => y.days >= 330)
  .map((y) => ({
    year: y.year,
    rain: Math.round(y.rain),
    rainDays: y.rainDays,
    heavy50: y.heavy50,
    hot34: y.hot34,
    hot35: y.hot35,
    tmean: y.tmeanN ? Number((y.tmeanSum / y.tmeanN).toFixed(2)) : null,
  }));
writeJson(path.join(OUT, "climate-long.json"), { station: ID, years: list });
console.log(`Climate long-run: ${list.length} full years at ${ID} (${list[0]?.year}–${list.at(-1)?.year})`);
