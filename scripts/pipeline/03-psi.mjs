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
    if (p?.data?.status === "DOWNLOAD_SUCCESS") url = p.data.url;
  }
  if (!url) throw new Error("PSI download did not become ready");
  const csv = await fetchRetry(url);
  fs.writeFileSync(cacheFile, csv);
}

const lines = fs.readFileSync(cacheFile, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
console.log("  PSI columns:", header.join(" | "));
const iTime = header.findIndex((h) => h.includes("date") || h.includes("time"));
const regions = ["north", "south", "east", "west", "central"];
const iReg = Object.fromEntries(regions.map((r) => [r, header.findIndex((h) => h.includes(r))]));

const daily = new Map(); // date -> {region: max}
for (const line of lines.slice(1)) {
  const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  const ts = c[iTime];
  if (!ts) continue;
  const date = ts.slice(0, 10);
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
