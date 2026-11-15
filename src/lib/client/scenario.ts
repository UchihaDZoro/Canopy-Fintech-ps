// Scenario day model for the simulator. The user sets the day's *readings*; this builds a
// plausible within-day shape for the animation so you can watch the levels being crossed.
// The payout itself always comes from the settlement engine (/api/simulate), not from here.

export const DAY_START = 8; // trading opens
export const DAY_END = 22; // trading closes
const STEP_MIN = 5;
export const N = ((DAY_END - DAY_START) * 60) / STEP_MIN + 1;

export interface DayModel {
  t: number[]; // hours (decimal) for each 5-min step
  rain: number[]; // mm per 5 min
  hour: number[]; // rolling 60-min total
  wbgt: number[]; // °C
  crossRain: (number | null)[]; // hour each rain level is first reached
  crossHeat: (number | null)[];
}

/** Convective storm: gaussian burst around `peak`, scaled so the wettest hour = target mm */
export function buildDay(rainTarget: number, peak: number, wbgtMax: number, rainLevels: number[], heatLevels: number[]): DayModel {
  const t = Array.from({ length: N }, (_, i) => DAY_START + (i * STEP_MIN) / 60);
  const sigma = 0.42; // hours (~25 min)
  const raw = t.map((h) => Math.exp(-((h - peak) ** 2) / (2 * sigma * sigma)));
  const roll = (arr: number[]) => arr.map((_, i) => arr.slice(Math.max(0, i - 11), i + 1).reduce((a, b) => a + b, 0));
  const maxRoll = Math.max(...roll(raw), 1e-9);
  const rain = raw.map((v) => (rainTarget > 0 ? (v / maxRoll) * rainTarget : 0));
  const hour = roll(rain);
  // WBGT: night baseline ~4°C below the day's max, peaking around 14:00
  const wbgt = t.map((h) => wbgtMax - 4 + 4 * Math.exp(-((h - 14) ** 2) / (2 * 2.6 * 2.6)));
  const first = (series: number[], lvl: number) => {
    const i = series.findIndex((v) => v >= lvl - 1e-9);
    return i < 0 ? null : t[i];
  };
  return {
    t,
    rain,
    hour,
    wbgt,
    crossRain: rainLevels.map((l) => first(hour, l)),
    crossHeat: heatLevels.map((l) => first(wbgt, l)),
  };
}

export const hhmm = (h: number) => {
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return `${String(H + (M === 60 ? 1 : 0)).padStart(2, "0")}:${String(M === 60 ? 0 : M).padStart(2, "0")}`;
};
