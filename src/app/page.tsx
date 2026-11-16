"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useMemo } from "react";
import { useApi } from "@/lib/client/api";
import type { DecisionTrace, LiveResponse, MetaResponse, PortfolioResponse } from "@/lib/client/types";
import { DEFAULT_PRODUCT as P } from "@/lib/engine/product";
import { Counter, Eyebrow, MONEY, PERIL_COLOR, Reveal, Why, sgd } from "@/components/ui";
import { ClimateChart, LossRatioChart } from "@/components/charts";
import { Rulebook } from "@/components/rulebook/Rulebook";
import { Receipt, ReceiptSkeleton } from "@/components/receipt/Receipt";
import { BriefGrid } from "@/components/landing/BriefGrid";
import { Ticker } from "@/components/landing/Ticker";
import { Journey } from "@/components/landing/Journey";

const Island = dynamic(() => import("@/components/three/Island"), { ssr: false, loading: () => <div className="h-full w-full skeleton" /> });

export default function Home() {
  const meta = useApi<MetaResponse>("/api/meta");
  const port = useApi<PortfolioResponse>("/api/portfolio", {});
  const live = useApi<LiveResponse>("/api/live", undefined, { refreshMs: 5 * 60e3 });
  const demo = meta.data?.hawkers.find((h) => h.id === "HC1");
  const receipt = useApi<DecisionTrace>(demo ? "/api/explain" : null, demo ? { lat: demo.lat, lon: demo.lon, label: demo.name, date: "2021-04-17" } : undefined);

  const areas = useMemo(() => (meta.data?.areas ?? []).map((a) => ({ ...a, value: a.riskCost })), [meta.data]);
  const pins = useMemo(() => {
    const byId = new Map(live.data?.centres.map((c) => [c.id, c.state]) ?? []);
    return (meta.data?.hawkers ?? []).filter((h) => h.stalls > 0).map((h) => ({ id: h.id, name: h.name, lat: h.lat, lon: h.lon, weight: Math.min(1, h.stalls / 150), state: byId.get(h.id) ?? "clear" }));
  }, [meta.data, live.data]);
  const wet = live.data?.rainStations.length ? live.data.rainStations.filter((s) => s.last60 > 0.2).length / live.data.rainStations.length : 0;

  const climate = meta.data?.climate.years ?? [];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const early = climate.filter((y) => y.year <= 1990);
  const late = climate.filter((y) => y.year >= 2016);
  const hotEarly = avg(early.map((y) => y.hot34));
  const hotLate = avg(late.map((y) => y.hot34));
  const tRise = avg(late.map((y) => y.tmean ?? 0).filter(Boolean)) - avg(early.map((y) => y.tmean ?? 0).filter(Boolean));
  const thisYear = String(new Date().getFullYear());
  const haze = meta.data?.hazeYears?.[thisYear];
  const weekly = port.data ? port.data.totals.premiumIncome / port.data.totals.policies / 52 : null;
  const risk = areas.map((a) => a.value);
  const today = new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore" });

  return (
    <main className="pt-24 md:pt-14">
      {/* ───────────── MASTHEAD / HERO ───────────── */}
      <section className="mx-auto max-w-[1400px] px-5 pt-8">
        <div className="caps flex flex-wrap items-center justify-between gap-2 border-y-2 border-ink py-1.5 text-ink">
          <span>Vol. 1 · Singapore</span>
          <span className="hidden md:inline">{today}</span>
          <span>Settled on NEA & MSS instruments</span>
        </div>
        <div className="grid gap-8 py-10 lg:grid-cols-[1fr_1.05fr]">
          <div data-tour="hero" className="flex flex-col justify-center">
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="sign text-[clamp(3rem,6.2vw,6.4rem)]">
              When rain shuts your stall,
              <br />
              <span className="relative inline-block">
                the gauge pays.
                <motion.span
                  className="absolute -bottom-1 left-0 h-[10px] bg-marigold"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.9, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ zIndex: -1 }}
                />
              </span>
            </motion.h1>
            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-2">
              <b className="text-ink">Daycover+</b> is income cover for Singapore&apos;s hawkers, designed with Income. It pays automatically when an{" "}
              <b className="text-ink">official rain gauge, heat sensor or haze reading</b> near your stall crosses a printed level — and prints a receipt
              explaining every decision. Priced on 12 years of records{weekly ? <> at about <b className="mono text-ink">{sgd(weekly, 2)}</b> a week</> : ""}.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/live" className="border-2 border-ink bg-ink px-5 py-3 text-[14px] font-semibold text-paper shadow-[4px_4px_0_var(--marigold)] transition-transform hover:-translate-y-0.5">
                See it settle live →
              </Link>
              <Link href="/cover" className="border-2 border-ink px-5 py-3 text-[14px] font-semibold hover:bg-paper-2">
                Check a stall&apos;s cover
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 border-t border-[var(--rule-2)] pt-4">
              <Mini k="Paid without a claim" v="0 forms" />
              <Mini k="Years back-tested" v={meta.data ? "2014–26" : "…"} />
              <Mini k="Hawker centres priced" v={meta.data ? String(meta.data.coverage.hawkerCentres) : "…"} />
            </div>
          </div>

          {/* FIG 1 */}
          <figure className="sheet flex flex-col" data-tour="island">
            <div className="flex items-center justify-between border-b border-[var(--rule-2)] px-4 py-2">
              <span className="caps text-ink">Fig. 1 — Back-tested payout risk, by planning area</span>
              <span className="caps text-ink-3">drag to rotate</span>
            </div>
            <div className="relative h-[440px] md:h-[520px]">
              {areas.length > 0 && (
                <Island
                  areas={areas}
                  pins={pins}
                  rain={Math.min(1, wet * 1.6)}
                  heightScale={1.6}
                  distance={19}
                  className="h-full w-full"
                  format={(a) => `S$${a.value}/yr expected payout per stall`}
                />
              )}
              <div className="pointer-events-none absolute bottom-3 left-3 border border-[var(--rule-2)] bg-card/90 px-3 py-2">
                <div className="caps text-ink-3">expected payout / stall / year</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="mono text-[11px]">{risk.length ? sgd(Math.min(...risk)) : "…"}</span>
                  <span className="h-2 w-28" style={{ background: "linear-gradient(90deg,#dfe5d3,#a9c9a4,#e9a100)" }} />
                  <span className="mono text-[11px]">{risk.length ? sgd(Math.max(...risk)) : "…"}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10.5px] text-ink-2">
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-ink" /> hawker centre</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: MONEY }} /> paid today</span>
                </div>
              </div>
            </div>
            <figcaption className="border-t border-[var(--rule-2)] px-4 py-2 text-[11.5px] text-ink-2">
              Each of URA&apos;s 55 planning areas is raised by what Daycover+ would have paid a stall there, replaying every day since 2014 on the nearest
              MSS gauge. Rain falling on the model mirrors the share of gauges reporting rain right now ({Math.round(wet * 100)}%).
            </figcaption>
          </figure>
        </div>
      </section>

      <Ticker live={live.data} />

      {/* ───────────── PROBLEM ───────────── */}
      <section className="mx-auto max-w-[1400px] px-5 py-20" data-tour="problem">
        <Reveal>
          <Eyebrow n="01">The problem, in Singapore&apos;s own records</Eyebrow>
          <h2 className="sign-soft max-w-4xl text-[clamp(2.2rem,4.5vw,3.8rem)]">
            The weather that empties a hawker centre is getting more frequent — and the income it takes is <span className="bg-alert-2 px-1">not insured</span>.
          </h2>
        </Reveal>
        <div className="mt-10 grid border-y-2 border-ink md:grid-cols-4">
          {[
            { v: <Counter value={meta.data?.coverage.stalls ?? 0} />, k: "cooked-food stalls in NEA hawker centres", s: `${meta.data?.coverage.hawkerCentres ?? "…"} centres · data.gov.sg`, c: "text-ink" },
            { v: <Counter value={hotLate} decimals={1} />, k: "days ≥ 34°C a year at Changi, 2016–25", s: `${hotEarly.toFixed(1)} a year in 1981–90`, c: "text-heat" },
            { v: <Counter value={tRise} decimals={2} prefix="+" suffix="°C" />, k: "rise in mean temperature since the 1980s", s: "MSS station S24", c: "text-heat" },
            { v: <Counter value={haze?.unhealthy ?? 0} />, k: `unhealthy-haze days in ${thisYear}`, s: `PSI peaked at ${haze?.peak ?? "…"}`, c: "text-haze" },
          ].map((x, i) => (
            <Reveal key={i} delay={i * 0.06} className={`p-5 ${i ? "md:border-l border-[var(--rule-2)]" : ""} ${i ? "border-t md:border-t-0" : ""}`}>
              <div className={`sign text-[64px] ${x.c}`}>{x.v}</div>
              <div className="mt-2 text-[14px] font-medium">{x.k}</div>
              <div className="caps mt-1 text-ink-3">{x.s}</div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <figure className="sheet mt-6 p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <span className="caps text-ink">Fig. 2 — Changi, {climate[0]?.year ?? "1981"}–{climate.at(-1)?.year ?? ""}: hot days (bars) and mean temperature (line)</span>
              <span className="caps text-ink-3">Meteorological Service Singapore</span>
            </div>
            {climate.length ? <ClimateChart years={climate} h={220} /> : <div className="skeleton h-52" />}
          </figure>
        </Reveal>
      </section>

      {/* ───────────── RULEBOOK ───────────── */}
      <section className="mx-auto max-w-[1400px] px-5 pb-20">
        <Eyebrow n="02">The product, as a rule you can play with</Eyebrow>
        <Rulebook meta={meta.data} />
        <Why className="mt-4">
          A parametric product lives or dies on whether people understand the trigger. The brief asks that a stallholder can explain it back in under a
          minute — so the rule is the interface: three readings, printed levels, one payout.
        </Why>
        <div className="mt-6">
          <Journey />
        </div>
      </section>

      {/* ───────────── RECEIPT ───────────── */}
      <section className="border-y-2 border-ink bg-paper-2 py-20">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 lg:grid-cols-[1fr_420px]">
          <div>
            <Eyebrow n="03">Accountable by design</Eyebrow>
            <h2 className="sign-soft text-[clamp(2.2rem,4.5vw,3.8rem)]">Every decision prints a receipt.</h2>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
              On the right is a real settlement, rebuilt from the record: the 17 April 2021 storm at Commonwealth Crescent Market. It shows which gauge
              counted and why, every reading against every level, the caps already used that year, what NEA forecast the evening before, and the transfer.
            </p>
            <div className="mt-8 grid max-w-xl gap-4 sm:grid-cols-3">
              {[
                ["Prep Pay", `${sgd(P.prepPay.advancePct * P.insuredDailyIncome)} at 6pm when NEA forecasts a heavy storm for your region — taken off the next payout, never owed back.`],
                ["Your own gauge", `Nearest working MSS gauge within ${P.stationRadiusKm} km; offline gauges skipped automatically.`],
                ["Said plainly", "Below the first level it pays nothing — the receipt shows that too, with the reading."],
              ].map(([k, d]) => (
                <div key={k} className="border-t-2 border-ink pt-2">
                  <div className="text-[13px] font-semibold">{k}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{d}</p>
                </div>
              ))}
            </div>
            <Link href="/live" className="link-u mt-8 inline-block text-[14px] font-semibold">
              Open any centre&apos;s receipt in the live console →
            </Link>
          </div>
          <div className="mx-auto w-full max-w-[420px]">{receipt.data ? <Receipt t={receipt.data} /> : <ReceiptSkeleton />}</div>
        </div>
      </section>

      {/* ───────────── EVIDENCE ───────────── */}
      <section className="mx-auto max-w-[1400px] px-5 py-20">
        <Eyebrow n="04">Back-tested, not guessed</Eyebrow>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <figure className="sheet p-5">
            <div className="caps mb-3 text-ink">
              Fig. 4 — Portfolio loss ratio by year · {port.data?.totals.policies.toLocaleString() ?? "…"} policies across {port.data?.totals.centres ?? "…"} centres
            </div>
            {port.data ? <LossRatioChart years={port.data.years} h={230} /> : <div className="skeleton h-56" />}
            <div className="mt-2 flex gap-4 text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-plate" /> paid to stallholders ÷ premium</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-haze" /> recovered from reinsurer</span>
            </div>
          </figure>
          <div className="flex flex-col justify-between gap-5 border-l-2 border-ink pl-6">
            <Big k="Average loss ratio" v={port.data ? <Counter value={port.data.totals.avgLossRatio * 100} suffix="%" /> : "…"} s="target 55–70%, expenses capped at 20%" />
            <Big k="Worst single day" v={port.data ? sgd(port.data.topDays[0]?.payout ?? 0) : "…"} s={port.data ? `${port.data.topDays[0]?.date} — ${port.data.topDays[0]?.policies} stalls paid at once` : ""} />
            <Big k="Premium" v={weekly ? <Counter value={weekly} decimals={2} prefix="S$" /> : "…"} s="per stall per week, community-rated" />
            <Link href="/studio" className="border-2 border-ink px-4 py-2 text-center text-[13px] font-semibold hover:bg-paper-2">Re-price it in the studio →</Link>
          </div>
        </div>
      </section>

      <BriefGrid />

      {/* ───────────── NEXT ───────────── */}
      <section className="mx-auto max-w-[1400px] px-5 pb-28">
        <Eyebrow n="06">Where to look next</Eyebrow>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { href: "/live", n: "02", t: "Live & replay", d: "The data wire, every centre on its own gauge, and real storms replayed with a receipt for each stall.", c: PERIL_COLOR.rain },
            { href: "/cover", n: "03", t: "Get covered", d: "A stallholder's flow: 12 years at your stall, a quote, one SMS in four languages and a teach-back.", c: "#0b6e4f" },
            { href: "/studio", n: "04", t: "Actuary studio", d: "Every rule is a control. Re-price 120 centres × 12 years, stress-test haze, check fairness.", c: PERIL_COLOR.haze },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="group sheet block p-5 transition-transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <span className="plate" style={{ background: x.c }}>#{x.n}</span>
                <span className="text-[20px] transition-transform group-hover:translate-x-1">→</span>
              </div>
              <div className="sign mt-4 text-[34px]">{x.t}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{x.d}</p>
            </Link>
          ))}
        </div>
        <footer className="mt-16 border-t-2 border-ink pt-4 text-[11.5px] text-ink-3">
          Data: NEA & MSS via data.gov.sg (rainfall, WBGT, PSI, forecasts, hawker centres), MSS historical daily records, URA Master Plan 2019. A hackathon prototype
          designed to be underwritten by Income Insurance Limited — figures are back-tests, not offers of insurance.
        </footer>
      </section>
    </main>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mono text-[18px] font-semibold">{v}</div>
      <div className="caps mt-0.5 text-ink-3">{k}</div>
    </div>
  );
}
function Big({ k, v, s }: { k: string; v: React.ReactNode; s: string }) {
  return (
    <div>
      <div className="caps text-ink-3">{k}</div>
      <div className="sign mt-1 text-[52px]">{v}</div>
      <div className="text-[12px] text-ink-2">{s}</div>
    </div>
  );
}
