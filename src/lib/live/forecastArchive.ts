import "server-only";
import { store } from "@/lib/data/store";
import type { Region } from "@/lib/engine/types";
import { severity } from "./nea";

// Evening-before NEA forecast for a given day: from the pipeline archive if sampled,
// otherwise fetched on demand from data.gov.sg (and memoised).
const REG: Region[] = ["north", "south", "east", "west", "central"];
const g = globalThis as unknown as { __canopyFc?: Map<string, EveningForecast | null> };
const memo = (g.__canopyFc ??= new Map());

export interface EveningForecast {
  target: string;
  issued: string | null;
  general: string;
  high: number | null;
  sev: Record<Region, number>;
  text: Record<Region, string>;
  source: "archive" | "data.gov.sg (fetched on demand)";
}

export async function eveningForecastFor(target: string): Promise<EveningForecast | null> {
  if (memo.has(target)) return memo.get(target)!;
  const fc = store.forecast();
  const i = fc?.pos.get(target);
  if (fc && i !== undefined) {
    const r: EveningForecast = {
      target,
      issued: null,
      general: fc.general[i],
      high: fc.high[i],
      sev: Object.fromEntries(REG.map((x) => [x, fc[x][i]])) as Record<Region, number>,
      text: Object.fromEntries(REG.map((x) => [x, ["Fair", "Showers", "Thundery showers", "Heavy thundery showers"][fc[x][i]] ?? ""])) as Record<Region, string>,
      source: "archive",
    };
    memo.set(target, r);
    return r;
  }
  const d = new Date(target + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  const issueDay = d.toISOString().slice(0, 10);
  try {
    const headers: Record<string, string> = { "User-Agent": "Canopy/1.0" };
    if (process.env.DATA_GOV_SG_API_KEY) headers["x-api-key"] = process.env.DATA_GOV_SG_API_KEY;
    // One retry: data.gov.sg occasionally rate-limits (code 24) or drops a connection
    let j: { code?: number; data?: { records?: unknown[] } } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast?date=${issueDay}`, { headers, cache: "no-store", signal: AbortSignal.timeout(6000) });
        j = await res.json();
        if (j?.code === 0) break;
      } catch {
        j = null;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!j || j.code !== 0) {
      if (j && j.code !== 24) memo.set(target, null); // genuinely no forecast that day; network errors are not memoised
      return null;
    }
    const recs = (j.data?.records ?? []) as {
      timestamp?: string;
      general?: { forecast?: { text?: string }; temperature?: { high?: number } };
      periods?: { timePeriod?: { text?: string }; regions?: Record<Region, { text: string }> }[];
    }[];
    const evening = recs
      .filter((r) => r.timestamp?.startsWith(issueDay) && Number(r.timestamp.slice(11, 13)) >= 16 && Number(r.timestamp.slice(11, 13)) < 20)
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))[0];
    if (!evening) {
      memo.set(target, null);
      return null;
    }
    const tag = new Date(target + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const sev = Object.fromEntries(REG.map((x) => [x, 0])) as Record<Region, number>;
    const text = Object.fromEntries(REG.map((x) => [x, ""])) as Record<Region, string>;
    for (const p of evening.periods ?? []) {
      const label = p.timePeriod?.text ?? "";
      if (!/6 am to midday|midday to 6 pm/i.test(label) || !label.includes(tag)) continue;
      for (const x of REG) {
        const t = p.regions?.[x]?.text ?? "";
        const s = severity(t);
        if (s >= sev[x]) {
          sev[x] = s;
          text[x] = t;
        }
      }
    }
    const r: EveningForecast = {
      target,
      issued: evening.timestamp ?? null,
      general: evening.general?.forecast?.text ?? "",
      high: evening.general?.temperature?.high ?? null,
      sev,
      text,
      source: "data.gov.sg (fetched on demand)",
    };
    memo.set(target, r);
    return r;
  } catch {
    return null;
  }
}

/** Same as eveningForecastFor, but never makes the caller wait more than `ms`.
 *  A slow lookup keeps running in the background and is memoised for the next request. */
export function eveningForecastWithin(target: string, ms = 2500): Promise<EveningForecast | null> {
  return Promise.race([eveningForecastFor(target), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
