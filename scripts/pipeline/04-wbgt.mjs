// Step 4: NEA WBGT observations (15-min, ~Feb 2025 → present).
// Used to (a) calibrate the heat-stress model against MSS temperatures and
// (b) power the live heat trigger. Each sampled day is cached (resumable).
import fs from "node:fs";
import path from "node:path";
import { fetchRetry, sleep, ensureDir, writeJson, dateRange, progressLogger, RAW, OUT, sgToday } from "./lib.mjs";

const START = process.env.WBGT_START ?? "2025-02-12";
const STEP = Number(process.env.WBGT_STEP_DAYS ?? 2);
const CACHE = ensureDir(path.join(RAW, "wbgt"));
const yesterday = new Date(new Date(sgToday() + "T00:00:00Z").getTime() - 864e5).toISOString().slice(0, 10);
const days = dateRange(START, yesterday, STEP);
const log = progressLogger("WBGT days");

async function fetchDay(date) {
  const f = path.join(CACHE, `${date}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const perStation = {}; // id -> {max, hHigh, hMod, n}
  let token = null;
  let pages = 0;
  do {
    const url =
      `https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt&date=${date}` +
      (token ? `&paginationToken=${encodeURIComponent(token)}` : "");
    const j = await fetchRetry(url, { asJson: true });
    await sleep(900);
    if (!j || j.code !== 0) break;
    for (const rec of j.data.records ?? []) {
      const hour = Number(rec.datetime.slice(11, 13));
      for (const r of rec.item?.readings ?? []) {
        const v = Number(r.wbgt);
        if (!Number.isFinite(v)) continue;
        const s = (perStation[r.station.id] ??= { max: -1, hHigh: 0, hMod: 0, n: 0 });
        s.max = Math.max(s.max, v);
        s.n++;
        // trading/working window 08:00-20:00, readings are 15-min => 0.25h each
        if (hour >= 8 && hour < 20) {
          if (v >= 33) s.hHigh += 0.25;
          if (v >= 31) s.hMod += 0.25;
        }
      }
    }
    token = j.data.paginationToken;
    pages++;
  } while (token && pages < 12);
  fs.writeFileSync(f, JSON.stringify(perStation));
  return perStation;
}

const result = { date: [], stations: {} };
for (let i = 0; i < days.length; i++) {
  const d = days[i];
  const day = await fetchDay(d);
  log(i + 1, days.length);
  if (!Object.keys(day).length) continue;
  result.date.push(d);
  const k = result.date.length - 1;
  for (const [id, s] of Object.entries(day)) {
    const st = (result.stations[id] ??= { max: [], hHigh: [], hMod: [] });
    while (st.max.length < k) {
      st.max.push(null);
      st.hHigh.push(null);
      st.hMod.push(null);
    }
    st.max.push(s.n ? s.max : null);
    st.hHigh.push(s.n ? s.hHigh : null);
    st.hMod.push(s.n ? s.hMod : null);
  }
}
for (const st of Object.values(result.stations)) {
  while (st.max.length < result.date.length) {
    st.max.push(null);
    st.hHigh.push(null);
    st.hMod.push(null);
  }
}
writeJson(path.join(OUT, "wbgt-daily.json"), result);
console.log(`WBGT: ${result.date.length} days, ${Object.keys(result.stations).length} stations`);
