import { round } from "./math";
import type { Peril, ProductSpec, Tier } from "./types";

/**
 * The settlement rule, in one place. Given the day's readings, the caps already used this
 * year and what NEA forecast the evening before, decide what is paid and why.
 * Used by the receipt engine (real days) and the scenario simulator (what-if days),
 * so a simulation can never disagree with a real settlement.
 */
export interface SettleInput {
  values: Record<Peril, number | null>;
  usedBefore: Record<Peril, number>;
  forecast: { sev: number; high: number | null } | null;
}

export const SEVERITY = ["Fair", "Showers", "Thundery showers", "Heavy thundery showers"];
const UNIT: Record<Peril, string> = { rain: "mm in 60 min", heat: "°C WBGT", haze: "24-h PSI" };

export function tierOf(v: number | null, tiers: Tier[]): [number, number] {
  if (v === null) return [0, 0];
  let t = 0,
    pct = 0;
  tiers.forEach((x, i) => {
    if (v >= x.threshold && x.payoutPct >= pct) {
      t = i + 1;
      pct = x.payoutPct;
    }
  });
  return [t, pct];
}

const fmt = (v: number) => `S$${Number.isInteger(v) ? v : v.toFixed(2)}`;

export function settle(spec: ProductSpec, input: SettleInput) {
  const income = spec.insuredDailyIncome;
  const perils = (["rain", "heat", "haze"] as Peril[]).map((p) => {
    const ps = spec.perils[p];
    const v = input.values[p];
    const [tier, pctv] = ps.enabled ? tierOf(v, ps.tiers) : [0, 0];
    return {
      peril: p,
      enabled: ps.enabled,
      value: v,
      unit: UNIT[p],
      tiers: ps.tiers.map((t) => ({ threshold: t.threshold, amount: round(t.payoutPct * income, 2), reached: v !== null && v >= t.threshold })),
      tier,
      amount: round(pctv * income, 2),
    };
  });
  const used = input.usedBefore;
  const totalBefore = used.rain + used.heat + used.haze;
  const open = perils.filter((p) => p.amount > 0 && used[p.peril] < spec.perils[p.peril].maxDays).sort((a, b) => b.amount - a.amount);
  const anyTrig = perils.some((p) => p.amount > 0);
  const totalBlocked = totalBefore >= spec.maxPayableDaysPerYear;
  const winner = !totalBlocked ? open[0] : undefined;
  const blocked = anyTrig && !winner;

  const fc = input.forecast;
  const sent =
    !!fc && spec.prepPay.enabled && (fc.sev >= spec.prepPay.minSeverity || (spec.perils.heat.enabled && fc.high !== null && fc.high >= spec.prepPay.heatForecastC));
  const advance = sent ? round(spec.prepPay.advancePct * income, 2) : 0;
  const gross = winner ? winner.amount : 0;
  const deducted = spec.prepPay.recoup ? Math.min(advance, gross) : 0;
  const transfer = round(gross - deducted, 2);

  const reasons: string[] = [];
  for (const p of perils) {
    if (!p.enabled) continue;
    const t1 = p.tiers[0]?.threshold;
    if (p.value === null) reasons.push(`${p.peril}: no reading available`);
    else if (p.tier === 0) reasons.push(`${p.peril}: ${p.value} ${p.unit} is below the first level (${t1})`);
    else reasons.push(`${p.peril}: ${p.value} ${p.unit} reached level ${p.tier} (≥ ${p.tiers[p.tier - 1].threshold}) → ${fmt(p.amount)}`);
  }
  if (winner && open.length > 1) reasons.push(`Several perils triggered — the day pays the single highest (${winner.peril}), no stacking`);
  if (blocked)
    reasons.push(
      totalBlocked
        ? `Yearly cap of ${spec.maxPayableDaysPerYear} payable days already used`
        : `This peril's cap of ${spec.perils[perils.find((p) => p.amount > 0)!.peril].maxDays} days already used this year`
    );
  if (sent)
    reasons.push(
      spec.prepPay.recoup
        ? `Prep Pay ${fmt(advance)} sent the evening before${gross ? ", deducted from today's payout" : " — carried against the next payout, never owed back"}`
        : `Prep Pay ${fmt(advance)} sent the evening before (kept)`
    );
  const headline = winner
    ? `Paid ${fmt(transfer)}${deducted ? ` (${fmt(gross)} less ${fmt(deducted)} advanced last night)` : ""} — ${winner.peril} level ${winner.tier}`
    : blocked
      ? "Trigger reached, but the cap for this year is used up"
      : "Not paid — no reading reached a payout level";

  return {
    perils,
    totalBefore,
    blocked,
    sent,
    advance,
    decision: {
      peril: winner?.peril ?? null,
      tier: winner?.tier ?? 0,
      gross,
      advanceDeducted: deducted,
      transfer,
      verdict: (winner ? "paid" : blocked ? "capped" : "not-paid") as "paid" | "capped" | "not-paid",
      headline,
      reasons,
    },
  };
}
