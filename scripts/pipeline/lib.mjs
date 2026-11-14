// Shared helpers for the Canopy data pipeline.
// All data comes from public, independent sources:
//   - data.gov.sg real-time APIs (NEA / MSS): station metadata, WBGT, PSI
//   - weather.gov.sg MSS historical daily records (1980s+): rainfall & temperature
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const RAW = path.join(ROOT, "data", "raw");
export const OUT = path.join(ROOT, "src", "data", "generated");

export const UA = "Mozilla/5.0 (Canopy climate-cover research pipeline)";

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with retries, exponential backoff and data.gov.sg rate-limit handling */
export async function fetchRetry(url, { tries = 6, asJson = false, okStatuses = [200] } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 404) return null;
      if (res.status === 429) {
        await sleep(11000);
        continue;
      }
      if (!okStatuses.includes(res.status)) throw new Error(`HTTP ${res.status} for ${url}`);
      if (asJson) {
        const j = await res.json();
        if (j && j.code === 24) {
          // TOO_MANY_REQUESTS from data.gov.sg
          await sleep(11000);
          continue;
        }
        return j;
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(800 * 2 ** i);
    }
  }
  throw lastErr ?? new Error(`Failed: ${url}`);
}

/** Run async tasks with bounded concurrency */
export async function pool(items, limit, worker, onProgress) {
  let idx = 0;
  let done = 0;
  const results = new Array(items.length);
  async function run() {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await worker(items[my], my);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  wrote ${path.relative(ROOT, file)} (${kb} KB)`);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function progressLogger(label) {
  let last = 0;
  return (done, total) => {
    const now = Date.now();
    if (now - last > 4000 || done === total) {
      last = now;
      console.log(`  ${label}: ${done}/${total}`);
    }
  };
}

/** YYYY-MM-DD list between two dates inclusive */
export function dateRange(start, end, stepDays = 1) {
  const out = [];
  const d = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + stepDays);
  }
  return out;
}

export function sgToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}
