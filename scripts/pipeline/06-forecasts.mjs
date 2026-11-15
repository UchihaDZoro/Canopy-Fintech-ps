// Step 6: Historical NEA 24-hour forecasts (2018 → present).
// For each evening (16:00–20:00 issue — when "Prep Pay" would be sent) we store the
// next day's daytime forecast per region. This lets us back-test the advance payout
// against what forecasters actually said, not an assumed hit-rate.
import fs from "node:fs";
import path from "node:path";
import { fetchRetry, sleep, ensureDir, writeJson, dateRange, progressLogger, RAW, OUT, sgToday } from "./lib.mjs";

const START = process.env.FC_START ?? "2018-06-01";
const STEP = Number(process.env.FC_STEP_DAYS ?? 2);
const CACHE = ensureDir(path.join(RAW, "forecast"));
const REGIONS = ["north", "south", "east", "west", "central"];
const yesterday = new Date(new Date(sgToday() + "T00:00:00Z").getTime() - 864e5).toISOString().slice(0, 10);
const issueDays = dateRange(START, yesterday, STEP);
const log = progressLogger("forecast days");

// Severity scale used for Prep Pay decisions (0 = fine … 3 = severe)
export function severity(text = "") {
  const t = text.toLowerCase();
  if (/heavy thundery|heavy rain|heavy showers/.test(t)) return 3;
  if (/thundery/.test(t)) return 2;
  if (/showers|moderate rain|rain/.test(t)) return 1;
  return 0;
}

function nextDay(d) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

async function fetchIssue(date) {
  const f = path.join(CACHE, `${date}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const j = await fetchRetry(`https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast?date=${date}`, { asJson: true });
  await sleep(900);
  const recs = j?.data?.records ?? [];
  // Evening issue: latest record issued 16:00–20:00 SGT
  const evening = recs
    .filter((r) => {
      const ts = r.timestamp ?? r.updatedTimestamp;
      const h = Number(ts?.slice(11, 13));
      return ts?.startsWith(date) && h >= 16 && h < 20;
    })
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))[0];
  let out = null;
  if (evening) {
    const target = nextDay(date);
    const tag = new Date(target + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const sev = Object.fromEntries(REGIONS.map((r) => [r, 0]));
    const text = Object.fromEntries(REGIONS.map((r) => [r, ""]));
    for (const p of evening.periods ?? []) {
      const label = p.timePeriod?.text ?? "";
      const daytime = /6 am to midday|midday to 6 pm/i.test(label) && label.includes(tag);
      if (!daytime) continue;
      for (const r of REGIONS) {
        const t = p.regions?.[r]?.text ?? "";
        const s = severity(t);
        if (s >= sev[r]) {
          sev[r] = s;
          text[r] = t;
        }
      }
    }
    out = {
      target,
      issued: evening.timestamp,
      high: evening.general?.temperature?.high ?? null,
      general: evening.general?.forecast?.text ?? "",
      sev,
      text,
    };
  }
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}

const res = { regions: REGIONS, target: [], high: [], general: [] };
for (const r of REGIONS) res[r] = [];
for (let i = 0; i < issueDays.length; i++) {
  const o = await fetchIssue(issueDays[i]);
  log(i + 1, issueDays.length);
  if (!o) continue;
  res.target.push(o.target);
  res.high.push(o.high);
  res.general.push(o.general);
  for (const r of REGIONS) res[r].push(o.sev[r]);
}
writeJson(path.join(OUT, "forecast-daily.json"), res);
console.log(`Forecasts: ${res.target.length} evening issues (${res.target[0]} → ${res.target.at(-1)})`);
