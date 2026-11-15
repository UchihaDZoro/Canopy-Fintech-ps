// Step 3: NEA Historical 24-hr PSI (regional, hourly, Apr 2014 → present) via data.gov.sg download API.
// We keep the daily maximum of the hourly 24-hr PSI per region.
import fs from "node:fs";
import path from "node:path";
import { fetchRetry, sleep, ensureDir, writeJson, RAW, OUT } from "./lib.mjs";

const DATASET = "d_b4cf557f8750260d229c49fd768e11ed";
const BASE = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}`;
const cacheFile = path.join(ensureDir(RAW), "psi-historical.csv");

if (!fs.existsSync(cacheFile) || process.env.REFRESH) {
  await fetchRetry(`${BASE}/initiate-download`, { asJson: true });
  let url = null;
  for (let i = 0; i < 20 && !url; i++) {
    await sleep(2000);
    const p = await fetchRetry(`${BASE}/poll-download`, { asJson: true });
    if (p?.data?.url && (!p.data.status || p.data.status === "DOWNLOAD_SUCCESS")) url = p.data.url;
  }
  if (!url) throw new Error("PSI download did not become ready");
  const csv = await fetchRetry(url);
  fs.writeFileSync(cacheFile, csv);
}

const lines = fs.readFileSync(cacheFile, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
console.log("  PSI columns:", header.join(" | "));
// First column is the timestamp ("24hr_psi" header), formatted D/M/YYYY H:MM
const iTime = 0;
const regions = ["north", "south", "east", "west", "central"];
function toIsoDate(ts) {
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):/);
  if (m) {
    // Hour 0:00 belongs to the 24h period ending at midnight -> previous day
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (+m[4] === 0) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(ts) ? ts.slice(0, 10) : null;
}
const iReg = Object.fromEntries(regions.map((r) => [r, header.findIndex((h) => h.includes(r))]));

const daily = new Map(); // date -> {region: max}
for (const line of lines.slice(1)) {
  const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  const ts = c[iTime];
  const date = ts ? toIsoDate(ts) : null;
  if (!date) continue;
  const rec = daily.get(date) ?? {};
  for (const r of regions) {
    const v = Number(c[iReg[r]]);
    if (Number.isFinite(v) && v > 0) rec[r] = Math.max(rec[r] ?? 0, v);
  }
  daily.set(date, rec);
}

const dates = [...daily.keys()].sort();
const out = { regions, date: dates };
for (const r of regions) out[r] = dates.map((d) => daily.get(d)[r] ?? null);
writeJson(path.join(OUT, "psi-daily.json"), out);

const peak = dates.reduce(
  (best, d) => {
    const m = Math.max(...regions.map((r) => daily.get(d)[r] ?? 0));
    return m > best.v ? { d, v: m } : best;
  },
  { d: "", v: 0 }
);
console.log(`PSI: ${dates.length} days (${dates[0]} → ${dates.at(-1)}), peak ${peak.v} on ${peak.d}`);
