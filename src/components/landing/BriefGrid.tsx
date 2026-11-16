"use client";
import Link from "next/link";
import { DEFAULT_PRODUCT as P } from "@/lib/engine/product";
import { Eyebrow, Reveal } from "@/components/ui";

// Income's constraints, each with how Daycover+ answers it and where a judge can see it working.
const ROWS: [string, string, string, string][] = [
  ["Insurable interest", `Sold to licensed stallholders; payout sized to verified daily earnings (S$${P.insuredDailyIncome}) and kept below modelled loss.`, "/cover", "Get covered → quote"],
  ["Say plainly when it doesn't pay", "Bad days that wouldn't have paid are shown at your own stall before purchase, and on every NOT PAID receipt.", "/cover", "Time Machine"],
  ["Back-test the trigger", "Every rule replayed on 2014–26 MSS gauges, NEA PSI & WBGT; Prep Pay against 717 archived NEA forecasts.", "/studio", "Studio"],
  ["Use indices people act on", "MSS rain gauges, NEA WBGT bands (33°C = High), 24-h PSI bands (101 / 201). Feeds monitored on the data wire.", "/live", "Data wire"],
  ["Fallback if a feed fails", "Next-nearest gauge, then last good snapshot — the wire shows which was used.", "/live", "Data wire"],
  ["Worksite vs station heat", "Triggers at the station's own 'High' band; an explicit site offset is a studio control.", "/studio", "Studio → heat"],
  ["Decide who pays", "Stallholder-paid rider on Stallholder / SmartBiz360; optional time-limited NTUC co-pay line.", "/cover", "Quote"],
  ["Cap & pool perils", `Rain, heat, haze pooled; one peril pays per day; per-peril caps; max ${P.maxPayableDaysPerYear} days a year; stop-loss reinsurance.`, "/studio", "Stress test"],
  ["Affordability", "About S$5 a week — ~0.6% of daily income vs a 7.5% micro-insurance benchmark.", "/cover", "Quote"],
  ["One SMS, the customer's language", "Whole policy in one SMS in English, Malay or Chinese; Tamil in two. Then a teach-back.", "/cover", "SMS"],
  ["Explainable AI (MAS FEAT)", "Heat model published with coefficients and hold-out error; location pricing capped so exposed areas aren't priced out.", "/studio", "Heat model card"],
  ["No new hardware", "Public NEA / MSS data only. SMS + PayNow.", "/live", "Data wire"],
];

export function BriefGrid() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 pb-20">
      <Eyebrow n="05">Built to Income&apos;s brief</Eyebrow>
      <h2 className="sign-soft max-w-3xl text-[clamp(2rem,4vw,3.4rem)]">Every constraint, answered in the product — and where to see it.</h2>
      <div className="mt-8 border-t-2 border-ink">
        {ROWS.map(([k, d, href, where], i) => (
          <Reveal key={k} delay={(i % 4) * 0.03}>
            <div className="grid gap-2 border-b border-[var(--rule-2)] py-3 md:grid-cols-[40px_260px_1fr_160px] md:items-baseline">
              <span className="mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[14px] font-semibold">{k}</span>
              <span className="text-[13.5px] leading-relaxed text-ink-2">{d}</span>
              <Link href={href} className="link-u mono justify-self-start text-[11.5px] text-plate md:justify-self-end">
                see: {where} →
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
