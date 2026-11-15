// Builds docs/Canopy-Approach.pdf from the engine's real figures (docs/build/data.json)
// and screenshots of the running app (docs/build/shots). Rendered with the system Edge.
//   node scripts/docs/build-approach.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const B = path.join(ROOT, "docs", "build");
const d = JSON.parse(fs.readFileSync(path.join(B, "data.json"), "utf8"));
const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(B, "shots", f)).toString("base64")}`;

const P = d.product;
const T = d.tampines;
const inc = P.insuredDailyIncome;
const $ = (v, dp = 0) => `S$${Number(v).toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (v, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const early = d.climate.filter((y) => y.year <= 1990);
const late = d.climate.filter((y) => y.year >= 2016);
const tE = avg(early.map((y) => y.tmean).filter((v) => v != null));
const tL = avg(late.map((y) => y.tmean).filter((v) => v != null));
const hE = avg(early.map((y) => y.hot34));
const hL = avg(late.map((y) => y.hot34));
const weeklyPortfolio = d.port.totals.premiumIncome / d.port.totals.policies / 52;
const tier = (p) => P.perils[p].tiers.map((t, i) => `L${i + 1} ≥ ${t.threshold} → ${$(t.payoutPct * inc)}`).join("<br>");
const today = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

const fig = (file, n, cap) => `<figure><img src="${img(file)}"/><figcaption><b>Fig. ${n}</b> — ${cap}</figcaption></figure>`;
const why = (t) => `<div class="why"><span>Why</span><p>${t}</p></div>`;

// Small inline bar chart of the portfolio loss ratio by year (SVG, no dependencies)
function lrChart() {
  const ys = d.port.years;
  const W = 640, H = 170, l = 34, b = 22;
  const max = Math.max(1.1, ...ys.map((y) => y.lossRatio));
  const bw = (W - l - 10) / ys.length;
  const y = (v) => H - b - (v / max) * (H - b - 10);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${l}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd6c4"/><text x="${l - 5}" y="${y(v) + 3}" text-anchor="end" font-size="8">${Math.round(v * 100)}%</text>`).join("")}
    <line x1="${l}" x2="${W - 6}" y1="${y(1)}" y2="${y(1)}" stroke="#c0262d" stroke-dasharray="4 3"/>
    ${ys.map((r, i) => `<rect x="${l + i * bw + 3}" y="${y(r.lossRatio)}" width="${bw - 6}" height="${H - b - y(r.lossRatio)}" fill="#0b6e4f"/><text x="${l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="8">${String(r.year).slice(2)}</text><text x="${l + i * bw + bw / 2}" y="${y(r.lossRatio) - 3}" text-anchor="middle" font-size="7.5">${Math.round(r.lossRatio * 100)}</text>`).join("")}
  </svg>`;
}

// Climate signal at Changi
function climateChart() {
  const ys = d.climate;
  const W = 640, H = 150, l = 30, b = 20;
  const max = Math.max(...ys.map((y) => y.hot34)) * 1.1;
  const bw = (W - l - 10) / ys.length;
  const y = (v) => H - b - (v / max) * (H - b - 8);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${ys.map((r, i) => `<rect x="${l + i * bw + 1}" y="${y(r.hot34)}" width="${bw - 2}" height="${H - b - y(r.hot34)}" fill="#d2480f" opacity="${r.year >= 2016 ? 1 : 0.55}"/>${i % 5 === 0 ? `<text x="${l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="8">${r.year}</text>` : ""}`).join("")}
    <text x="${l}" y="10" font-size="8.5">days ≥ 34°C per year, Changi (S24)</text>
  </svg>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=block" rel="stylesheet">
<style>
@page { size: A4; margin: 17mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { font-family: Archivo, Arial, sans-serif; color: #16150f; font-size: 10.2pt; line-height: 1.5; margin: 0; }
.mono, code, td.n, th.n { font-family: "IBM Plex Mono", monospace; }
h1, h2, h3 { font-stretch: 70%; font-weight: 800; letter-spacing: -0.01em; line-height: 1.05; margin: 0; }
h2 { font-size: 22pt; text-transform: uppercase; margin: 0 0 4mm; padding-top: 2mm; border-top: 2.2pt solid #16150f; }
h3 { font-size: 13pt; margin: 5mm 0 2mm; font-stretch: 80%; }
p { margin: 0 0 2.6mm; }
.kicker { font-family: "IBM Plex Mono", monospace; font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: #4a473d; display: flex; align-items: center; gap: 6px; margin-bottom: 2mm; }
.plate { background: #0b6e4f; color: #fff; padding: 1px 6px; border-radius: 3px; font-weight: 600; letter-spacing: 0.05em; }
section { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; page-break-inside: avoid; }
th { text-align: left; font-family: "IBM Plex Mono", monospace; font-size: 7.4pt; letter-spacing: 0.08em; text-transform: uppercase; color: #4a473d; font-weight: 500; border-bottom: 1.4pt solid #16150f; padding: 1.6mm 2mm; }
td { border-bottom: 0.5pt solid #d8d1bd; padding: 1.6mm 2mm; vertical-align: top; }
td.n, th.n { text-align: right; white-space: nowrap; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; }
figure img { width: 100%; border: 0.8pt solid #16150f; display: block; }
figcaption { font-size: 8pt; color: #4a473d; margin-top: 1.4mm; }
.why { display: flex; gap: 8px; background: #fbf0d0; border-left: 3pt solid #e9a100; padding: 2.4mm 3mm; margin: 3mm 0; font-size: 9pt; page-break-inside: avoid; }
.why span { font-family: "IBM Plex Mono", monospace; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; padding-top: 1px; }
.why p { margin: 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.stat { border-top: 1.4pt solid #16150f; padding-top: 2mm; }
.stat b { display: block; font-family: "IBM Plex Mono", monospace; font-size: 17pt; font-weight: 600; line-height: 1.1; }
.stat span { font-size: 8.4pt; color: #4a473d; }
.chart { width: 100%; font-family: "IBM Plex Mono", monospace; fill: #4a473d; }
.box { border: 0.9pt solid #16150f; padding: 3mm 4mm; margin: 3mm 0; page-break-inside: avoid; background: #fbf9f3; }
ol, ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1mm; }
.cover { height: 258mm; display: flex; flex-direction: column; }
.cover .mast { font-family: "IBM Plex Mono", monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; border-top: 2pt solid #16150f; border-bottom: 2pt solid #16150f; padding: 1.5mm 0; display: flex; justify-content: space-between; }
.cover h1 { font-size: 46pt; font-stretch: 62%; text-transform: uppercase; margin-top: 10mm; }
.cover h1 em { font-style: normal; background: linear-gradient(transparent 62%, #e9a100 62%); }
.cover .sub { font-size: 12.5pt; color: #4a473d; margin-top: 5mm; max-width: 150mm; }
.cover img { margin-top: auto; width: 100%; border: 1pt solid #16150f; }
.toc { columns: 2; column-gap: 8mm; font-size: 9.6pt; }
.toc div { break-inside: avoid; border-bottom: 0.5pt dotted #b8b09a; padding: 1mm 0; }
.small { font-size: 8.4pt; color: #4a473d; }
.tag { display: inline-block; font-family: "IBM Plex Mono", monospace; font-size: 7.5pt; padding: 0 4px; border: 0.6pt solid #16150f; margin-right: 3px; }
</style></head><body>

<!-- ───────────────── COVER ───────────────── -->
<div class="cover">
  <div class="mast"><span>Singapore–India Hackathon 2026</span><span>FinTech / InsurTech · Income Insurance</span><span>${today}</span></div>
  <h1>Canopy — when rain shuts your stall, <em>the gauge pays.</em></h1>
  <p class="sub">Approach and design document. A parametric income cover for Singapore's hawkers, settled on official NEA and MSS readings at each stall's own gauge, back-tested on every day since 2014, with a printed receipt for every decision.</p>
  <img src="${img("01-hero.png")}"/>
</div>

<!-- ───────────────── CONTENTS + SUMMARY ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#00</span>Contents</div>
  <div class="toc">
    <div>1 · Executive summary</div><div>2 · The problem and what the brief demands</div><div>3 · Product design</div><div>4 · Data foundation</div>
    <div>5 · Settlement engine and explainability</div><div>6 · Back-test, pricing and portfolio</div><div>7 · Models: heat, loss, forecast skill, basis risk</div>
    <div>8 · Experience design</div><div>9 · Scenario lab and real SMS</div><div>10 · Compliance with the brief</div><div>11 · Limitations, stated plainly</div><div>12 · Pilot plan and roadmap</div><div>Appendix · Architecture and how to run</div>
  </div>

  <h2 style="margin-top:7mm">1 · Executive summary</h2>
  <p><b>Canopy</b> is income cover for hawkers and stallholders, designed to be underwritten by Income as a rider on Stallholder / SmartBiz360. When an <b>official rain gauge, heat-stress sensor or haze reading</b> near the stall crosses a printed level, it pays automatically by PayNow — no claim form, no adjuster — and sends an SMS explaining exactly why.</p>
  <div class="grid3">
    <div class="stat"><b>${$(T.quote.weeklyPremium, 2)}</b><span>per week at Tampines (${pct(T.quote.pctOfDailyIncome, 1)} of daily income); ${$(weeklyPortfolio, 2)} island average</span></div>
    <div class="stat"><b>${pct(d.port.totals.avgLossRatio)}</b><span>average loss ratio, ${d.port.totals.policies.toLocaleString()} policies × ${d.port.totals.centres} centres, 2014–2026 (σ ${pct(d.port.totals.sdLossRatio, 1)})</span></div>
    <div class="stat"><b>${pct(T.stats.yearsWithPayoutPct)}</b><span>of years paid out at least once — no "empty first season" (the failure of SEWA 2023, ZhongAn 2014)</span></div>
    <div class="stat"><b>${d.coverage.rainStations}</b><span>MSS rain gauges · ${d.coverage.wbgtStations} NEA WBGT stations · 5 PSI regions, all public data</span></div>
    <div class="stat"><b>${d.port.topDays[0].policies}</b><span>stalls paid on the worst single day (${d.port.topDays[0].date} storm) — concurrency is priced and reinsured</span></div>
    <div class="stat"><b>~1 min</b><span>gauge to phone: settlement runs on each new 5-minute reading; PayNow + SMS follow immediately</span></div>
  </div>
  <h3>What makes it different</h3>
  <ol>
    <li><b>Settled on the gauge you can see.</b> Each stall is matched to its nearest working MSS gauge (fallback to the next within ${P.stationRadiusKm} km), NEA's WBGT network and the regional 24-hour PSI — indices the public already acts on.</li>
    <li><b>Every decision prints a receipt.</b> Which instrument counted and why, each reading against each level, caps used, the forecast the evening before, the transfer. Live, historical and simulated days use the same function.</li>
    <li><b>Prep Pay.</b> ${$(P.prepPay.advancePct * inc)} the evening before a forecast heavy storm, taken off the next payout and never owed back — cash when it is needed, at ~zero cost to the pool (§7.3).</li>
    <li><b>The Weather Time Machine.</b> Before buying, a stallholder sees every day since 2014 at their own stall — including the bad days it would not have paid.</li>
    <li><b>Radical transparency about the data.</b> The live "Data Wire" shows every request to data.gov.sg, its latency, how many instruments answered and a raw sample.</li>
  </ol>
</section>

<!-- ───────────────── 2 PROBLEM ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#02</span>The problem</div>
  <h2>2 · The problem and what the brief demands</h2>
  <p>Singapore is getting hotter, wetter and — in El Niño years — hazier. MSS records at Changi show mean temperature rising from <b>${tE.toFixed(2)}°C (1981–90) to ${tL.toFixed(2)}°C (2016–25)</b> and days at or above 34°C rising from <b>${hE.toFixed(1)} to ${hL.toFixed(1)}</b> a year. The 2026 haze brought <b>${d.hazeYears["2026"].unhealthy}</b> unhealthy days. Meanwhile ${d.coverage.stalls.toLocaleString()} cooked-food stalls in ${d.coverage.hawkerCentres} NEA hawker centres have cover for property damage, but not for the income lost when the weather empties the centre.</p>
  ${climateChart()}
  <p class="small">Fig. 1 — Changi (S24) days ≥ 34°C per year, 1981–2025. Darker bars: 2016 onward. Source: MSS historical daily records.</p>
  <h3>Learning from what failed</h3>
  <p>Income's brief lists parametric schemes that stalled. Each failure became a design requirement:</p>
  <table><tr><th>Scheme and what went wrong</th><th>Canopy's answer</th></tr>
    <tr><td>SEWA 2023 — thresholds set at record heat; paid nothing; customers lost</td><td>Levels calibrated on 2014–26 frequencies; paid in ${pct(T.stats.yearsWithPayoutPct)} of years; per-location history shown before purchase</td></tr>
    <tr><td>SEWA — payouts took 6–8 weeks</td><td>Settles on each new 5-minute reading; PayNow within minutes</td></tr>
    <tr><td>ZhongAn 2014 — single 37°C threshold ignored humidity, "gambling-like"</td><td>WBGT (humidity-aware) bands; payout sized to verified earnings and kept below modelled loss</td></tr>
    <tr><td>Jakarta flood card — one city gauge, residents didn't see it as their risk</td><td>Each stall's own nearest gauge (median 1–2 km), shown on a map and on every receipt</td></tr>
    <tr><td>KB Insurance / Delhi trial — nobody would carry the premium</td><td>~${$(weeklyPortfolio, 2)}/week rider on an existing policy; optional time-limited co-pay line</td></tr>
    <tr><td>Igloo — risk of buying only when rain is forecast</td><td>7-day waiting period; seasonal subscription</td></tr>
    <tr><td>MiCRO / Haiti — loss ratio hit 100%, pool exhausted</td><td>Per-peril and yearly caps, one peril per day, aggregate stop-loss, haze stress test</td></tr>
    <tr><td>Caribbean LPP — demand faded in years with no payout</td><td>Frequent, small payouts (≈${T.stats.avgTriggerDays.toFixed(1)} days/yr) plus Prep Pay and risk-reduction nudges</td></tr>
    <tr><td>FloodFlash — depends on a sensor at each premises</td><td>No new hardware: public NEA/MSS instruments only</td></tr>
  </table>
</section>

<!-- ───────────────── 3 PRODUCT ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#03</span>Product</div>
  <h2>3 · Product design</h2>
  <h3>3.1 Who it is for</h3>
  <p><b>Launch segment: hawkers and stallholders</b> — the case study's open question is how to extend Stallholder / SmartBiz360 to climate-related income loss. Insurable interest is easy to evidence: an NEA stall licence fixes the location; 3 months of PayNow / SGQR receipts (with consent) verify typical earnings. The same engine serves outdoor and platform workers by changing the trading window and insured income.</p>
  <h3>3.2 Triggers, levels and payouts</h3>
  <p>Insured amount: <b>${$(inc)}/day</b> of net earnings (≈ median hawker take-home). Levels were calibrated from data, not chosen by eye: at the median gauge, the wettest hour reached ≥50 mm on ~2.8 days a year and ≥70 mm on ~0.4; WBGT ≥33°C (NEA "High") on a median ~6.7 days a year.</p>
  <table><tr><th>Peril</th><th>Index (official source)</th><th>Levels → payout</th><th class="n">Max days/yr</th></tr>
    <tr><td>Heavy rain</td><td>Wettest 60 minutes at the nearest working MSS gauge</td><td class="mono">${tier("rain")}</td><td class="n">${P.perils.rain.maxDays}</td></tr>
    <tr><td>Heat stress</td><td>Daily maximum WBGT at the nearest NEA station (worksite offset +${P.perils.heat.siteOffset}°C, configurable)</td><td class="mono">${tier("heat")}</td><td class="n">${P.perils.heat.maxDays}</td></tr>
    <tr><td>Haze</td><td>NEA 24-hour PSI for the stall's region</td><td class="mono">${tier("haze")}</td><td class="n">${P.perils.haze.maxDays}</td></tr>
  </table>
  <p><b>Rules, in order:</b> (1) compare each reading with its printed levels; (2) if several perils trigger, the day pays the single highest — no stacking; (3) apply the peril cap and the overall cap of ${P.maxPayableDaysPerYear} payable days a year; (4) deduct any Prep Pay advance; (5) transfer by PayNow and send the SMS.</p>
  ${why("Per-peril caps exist because a single yearly cap let the March–May heat season use up the cover before September haze. Pooling three perils smooths the pool's year; capping each protects the stallholder's cover across seasons.")}
  <h3>3.3 Prep Pay</h3>
  <p>At 6pm, if NEA's 24-hour forecast says "${["Fair", "Showers", "Thundery showers", "Heavy thundery showers"][P.prepPay.minSeverity].toLowerCase()}" for the stall's region (or a high ≥ ${P.prepPay.heatForecastC}°C), Canopy sends ${$(P.prepPay.advancePct * inc)} so the hawker can buy less stock. It is an <b>advance on the next payout</b> — deducted when the gauge triggers, never owed back — capped at ${P.prepPay.maxPerYear} a year. See §7.3 for why it is designed this way.</p>
  <h3>3.4 Exclusions and what it does not do</h3>
  <ul><li>Pays on the official reading only — a stall can lose sales and receive nothing (stated at sale, on every receipt, and shown in the Time Machine).</li><li>Does not cover injury (WICA) or property damage (SmartBiz360) — it complements them.</li><li>7-day waiting period; 14-day free look.</li></ul>
  <h3>3.5 Who pays, and distribution</h3>
  <p>A stallholder-paid rider on Stallholder / SmartBiz360, sold through Income's existing channels and NTUC union networks, with an optional, time-limited co-pay line (e.g. a town council or NTUC fund) shown with an end date — no permanent subsidy.</p>
  <h3>3.6 One SMS, four languages, then a teach-back</h3>
  <p>The whole policy fits a single SMS in English, Malay and Chinese (Tamil needs two Unicode segments — shown honestly). Before buying, a 3-question teach-back must be passed — including the no-pay level (e.g. "45 mm fell at your gauge — what is paid?" → S$0).</p>
</section>

<!-- ───────────────── 4 DATA ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#04</span>Data</div>
  <h2>4 · Data foundation</h2>
  <p>Every number in the product comes from public, independent, verifiable sources — the brief's test for a trigger — via a resumable 9-step pipeline (<code>npm run pipeline</code>).</p>
  <table><tr><th>Source</th><th>Coverage</th><th>Used for</th></tr>
    <tr><td>MSS historical daily records (weather.gov.sg)</td><td class="mono">${d.coverage.rainStations} gauges · ${d.coverage.rainFrom} → ${d.coverage.rainTo}</td><td>Rain back-test (wettest 30/60/120 min), temperatures</td></tr>
    <tr><td>MSS Changi S24 long record</td><td class="mono">1981 → 2025</td><td>Climate trend loading, problem framing</td></tr>
    <tr><td>NEA WBGT observations (data.gov.sg)</td><td class="mono">${d.coverage.wbgtStations} stations · Feb 2025 →</td><td>Live heat trigger; heat-model calibration</td></tr>
    <tr><td>NEA historical 24-h PSI</td><td class="mono">${d.coverage.psiFrom} → ${d.coverage.psiTo}</td><td>Haze back-test (2015 peak 322)</td></tr>
    <tr><td>NEA 24-hour forecasts (evening issue)</td><td class="mono">${d.coverage.forecastDays} days since ${d.coverage.forecastFrom}</td><td>Prep Pay skill back-test and live decision</td></tr>
    <tr><td>NEA real-time rainfall, WBGT, PSI, 2-h nowcast</td><td class="mono">5–60 min cadence</td><td>Live settlement and the Data Wire</td></tr>
    <tr><td>NEA hawker centres (GeoJSON)</td><td class="mono">${d.coverage.hawkerCentres} centres · ${d.coverage.stalls.toLocaleString()} stalls</td><td>Real exposure for portfolio pricing</td></tr>
    <tr><td>URA Master Plan 2019 planning areas</td><td class="mono">55 areas</td><td>3D risk model, area simulations, offline map fallback</td></tr>
  </table>
  <h3>Engineering choices</h3>
  <ul>
    <li><b>Resumable and cached:</b> every raw download is cached; data.gov.sg rate limits are handled with back-off; an optional API key raises the limit.</li>
    <li><b>Fallbacks everywhere:</b> nearest gauge → next gauge; live feed failure → last good snapshot (flagged "stale"/"fallback" on the Data Wire); hosted basemap unreachable → map drawn from URA outlines.</li>
    <li><b>Incremental live polling:</b> the browser polls every 30 s; the server refreshes each feed at NEA's cadence (rain/WBGT 60 s, PSI 2 min, forecast 10 min), fetching only the newest page of 5-minute rainfall and merging it.</li>
  </ul>
  ${fig("05-wire.png", 2, "The Data Wire: every request the engine made to data.gov.sg — endpoint, latency, instruments that answered, a raw reading — flowing into the trigger engine.")}
</section>

<!-- ───────────────── 5 ENGINE ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#05</span>Engine</div>
  <h2>5 · Settlement engine and explainability</h2>
  <p>A single function, <code>settle()</code>, implements the rule in §3.2. The <b>receipt engine</b> wraps it with station selection, readings, caps used so far that year and the evening forecast; the <b>replay</b> runs it for every centre on any past day; the <b>scenario lab</b> runs it on what-if readings. Because all three call the same function, a simulation can never disagree with a real settlement.</p>
  <div class="grid2">
    <div>
      <h3>Station selection</h3>
      <p>For Tampines Round Market: rain gauge <span class="tag">${T.stations.rain[0].id}</span> at ${T.stations.rain[0].km} km, then fallbacks ${T.stations.rain.slice(1).map((s) => `<span class="tag">${s.id}</span>`).join("")}; heat from ${T.stations.wbgt.name}; haze from the ${T.stations.region} PSI region. A gauge that did not report is skipped automatically and the receipt says so.</p>
      <h3>The receipt</h3>
      <p>Six numbered steps: which instruments count · readings against the printed levels · (live) the wettest 60-minute window in 5-minute data · caps used this year · Prep Pay · the transfer — stamped PAID, NOT PAID or CAPPED. It is the explanation a stallholder, Income's claims team or MAS would ask for.</p>
      ${why("Explainability is not a report generated afterwards — it is the same data structure the engine produced while deciding.")}
    </div>
    <div>${fig("04-receipt.png", 3, "A real settlement rebuilt from the record: 17 April 2021, Commonwealth Crescent Market.")}</div>
  </div>
  <h3>Replay: one day, every centre</h3>
  <p>On 17 April 2021, <b>${d.replay.gaugesOverT1} of ${d.replay.gaugesReporting}</b> gauges passed ${P.perils.rain.tiers[0].threshold} mm in an hour (wettest: ${d.replay.wettest[0].id} ${d.replay.wettest[0].name}, ${d.replay.wettest[0].r60} mm). <b>${d.replay.centresPaid} of 120</b> centres were paid; ${d.replay.close} came close; ${d.replay.clear} stayed below every level. The replay tells this as four frames — evening forecast, rain field, settlement, why the others weren't — and every centre has a receipt.</p>
  ${fig("06-replay.png", 4, "Replay of 17 April 2021: a plain-language verdict, a reading guide and the four-frame story.")}
</section>

<section>
  ${fig("07-replay-map.png", 5, "The rain field gauge by gauge (bubbles sized by wettest hour) with paid centres in gold, beside the receipt for Yuhua Village.")}
  ${why(`Replaying 25 September 2015 (PSI ${d.hazeReplay.maxPsi}) shows ${d.hazeReplay.capped} centres <b>capped</b>: their ${P.perils.haze.maxDays} haze days had already been paid earlier that month. The replay shows this rather than hiding it — the cap is what keeps a regional haze from exhausting the pool.`)}
</section>

<!-- ───────────────── 6 BACKTEST & PRICING ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#06</span>Pricing</div>
  <h2>6 · Back-test, pricing and portfolio</h2>
  <h3>6.1 Method</h3>
  <p>For each location, the engine settles every day from 2014 against the official record, applying caps year by year exactly as in production. Expected annual payout plus net Prep Pay cost is the risk cost; the premium is built up transparently:</p>
  <table><tr><th>Component (Tampines Round Market)</th><th class="n">S$ / year</th><th>How it is computed</th></tr>
    <tr><td>Expected payouts</td><td class="n">${$(T.quote.breakdown.purePremium, 2)}</td><td>Back-tested average, 2014–2026 (rain ${$(T.stats.byPeril.rain)}, heat ${$(T.stats.byPeril.heat)}, haze ${$(T.stats.byPeril.haze)})</td></tr>
    <tr><td>Prep Pay net cost</td><td class="n">${$(T.quote.breakdown.prepPayCost, 2)}</td><td>Advances are recovered from later payouts in the same year</td></tr>
    <tr><td>Climate trend</td><td class="n">${$(T.quote.breakdown.trendLoad, 2)}</td><td>${pct(P.loadings.climateTrend)}/yr projection from the data mid-point (V3 medium; low/high selectable)</td></tr>
    <tr><td>Catastrophe load</td><td class="n">${$(T.quote.breakdown.catLoad, 2)}</td><td>${P.loadings.catLoad} × σ of annual payouts</td></tr>
    <tr><td>Expenses (20%) and margin</td><td class="n">${$(T.quote.breakdown.expenses + T.quote.breakdown.margin, 2)}</td><td>Expense ratio held at the brief's 20% ceiling</td></tr>
    <tr><td><b>Annual premium</b></td><td class="n"><b>${$(T.quote.annualPremium, 2)}</b></td><td><b>${$(T.quote.weeklyPremium, 2)} a week · expected loss ratio ${pct(T.quote.expectedLossRatio)}</b></td></tr>
  </table>
  <p>Location relativity is <b>community-rated and capped at ±${pct(P.loadings.zoneCap)}</b>: Tampines' raw risk is ×${T.quote.rawZoneFactor} the island average; the west's is ×${d.port.regions.find((r) => r.region === "west").rawZoneFactor}, but its premium is capped.</p>
  <h3>6.2 Portfolio — ${d.port.totals.centres} centres, 30% take-up</h3>
  ${lrChart()}
  <p class="small">Fig. 6 — Loss ratio by year (paid ÷ premium). Red dashed line = 100%. 2026 is a partial year.</p>
  <div class="grid2">
    <table><tr><th>Worst concurrent days</th><th class="n">Stalls paid</th><th class="n">S$ paid</th></tr>
      ${d.port.topDays.map((t) => `<tr><td class="mono">${t.date} · ${t.peril}</td><td class="n">${t.policies.toLocaleString()}</td><td class="n">${$(t.payout)}</td></tr>`).join("")}
    </table>
    <table><tr><th>Haze stress test</th><th class="n">Payable days</th><th class="n">Loss ratio</th></tr>
      ${d.port.stress.map((s) => `<tr><td class="mono">PSI ${s.psi} for ${s.days} days</td><td class="n">${s.payDays}</td><td class="n">${pct(s.lossRatio)}</td></tr>`).join("")}
    </table>
  </div>
  <table><tr><th>Region</th><th class="n">Stalls</th><th class="n">Raw risk</th><th class="n">Premium / week</th></tr>
    ${d.port.regions.map((r) => `<tr><td style="text-transform:capitalize">${r.region}</td><td class="n">${r.stalls.toLocaleString()}</td><td class="n">×${r.rawZoneFactor}</td><td class="n">${$(r.avgWeeklyPremium, 2)}</td></tr>`).join("")}
  </table>
  ${why("An aggregate stop-loss attaches at a 120% loss ratio. The haze stress test shows why per-peril caps matter: even a 2015-scale PSI 322 for 21 days stays within the pool because each stall can claim at most four haze days a year.")}
</section>

<!-- ───────────────── 7 MODELS ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#07</span>Models</div>
  <h2>7 · Models — explainable by construction (MAS FEAT)</h2>
  <h3>7.1 Heat model</h3>
  <p>NEA's WBGT network only exists from February 2025, but heat must be priced over 12 years. A <b>published linear model</b> maps MSS daily temperatures to daily maximum WBGT:</p>
  <p class="mono" style="font-size:8.6pt">WBGT<sub>max</sub> ≈ ${d.heat.coefficients[0].toFixed(2)} + ${d.heat.coefficients[1].toFixed(3)}·T<sub>max</sub> + ${d.heat.coefficients[2].toFixed(3)}·T<sub>mean</sub> + ${d.heat.coefficients[3].toFixed(3)}·ln(1+rain) + ${d.heat.coefficients[4].toFixed(3)}·sin(season) ${d.heat.coefficients[5].toFixed(3)}·cos(season)</p>
  <table><tr><th>Fit</th><th class="n">Pairs</th><th class="n">R²</th><th class="n">MAE</th><th>Period</th></tr>
    <tr><td>Training</td><td class="n">${d.heat.train.n}</td><td class="n">${d.heat.train.r2}</td><td class="n">${d.heat.train.mae}°C</td><td class="mono">${d.heat.train.from} → ${d.heat.train.to}</td></tr>
    <tr><td>Time-based hold-out</td><td class="n">${d.heat.validation.n}</td><td class="n">${d.heat.validation.r2}</td><td class="n">${d.heat.validation.mae}°C</td><td class="mono">${d.heat.validation.from} → ${d.heat.validation.to}</td></tr>
  </table>
  <p>The hold-out R² is modest because daily records lack humidity. Rather than ignore that error, each historical day is priced by the <b>probability</b> WBGT crossed the level, using the residual σ = ${d.heat.residualSigma}°C. <b>Live payouts always use observed WBGT</b>; the model only reconstructs history.</p>
  <h3>7.2 Loss model and insurable interest</h3>
  <p>A transparent, editable revenue-drop function (rain above 12 mm/h, WBGT above 31°C, PSI above 100) sizes payouts and powers the "days you'd have lost and not been paid" disclosure. On trigger days, payout ÷ modelled loss averages <b>${T.stats.payoutToLossOnTriggerDays}</b> — below 1, so Canopy is insurance, not a bet. At Tampines it pays on ≈${T.stats.avgTriggerDays.toFixed(1)} days a year and misses ≈${T.stats.avgMissedLossDays.toFixed(1)} likely-loss days — said plainly at the point of sale.</p>
  <h3>7.3 Forecast skill — why Prep Pay is an advance</h3>
  <p>Back-tested against ${T.prep.forecastDays} archived NEA evening forecasts: the region is forecast "heavy thundery showers" about <b>${T.prep.forecastAlertsPerYear} times a year</b>, but only <b>${pct(T.prep.hitRate)}</b> of those are followed by a trigger at a given gauge (half of all payouts were forewarned). Paid as a gift, advances would almost double the premium. Designed as an advance on the next payout, capped at ${P.prepPay.maxPerYear} a year, the back-tested net cost is <b>${$(T.prep.netCostPerYear)}</b> — the stallholder still gets cash the evening before.</p>
  <h3>7.4 Basis risk, measured</h3>
  <p>Storms are local. When the second-nearest gauge reaches level 1, the nearest one does too only <b>${pct(T.stats.gaugeAgreement)}</b> of the time at Tampines. Canopy reports this per location instead of hiding it, and settles on the gauge closest to the stall (median distance 1–2 km).</p>
</section>

<!-- ───────────────── 8 EXPERIENCE ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#08</span>Experience</div>
  <h2>8 · Experience design</h2>
  <p><b>Concept — "The Weather Ledger".</b> Insurance that pays on public instruments should feel like a document of record: warm paper and ink for what people read; dark "scope" panels only where machine data flows; condensed signage type (Archivo) for headlines and monospace (IBM Plex Mono) for every measured number; one colour per meaning (green = cover, marigold = money paid, blue = rain, orange = heat, violet = haze, red = lost-not-paid). Motifs come from the hawker centre itself: stall number plates as step labels and thermal receipts as the explanation.</p>
  <table><tr><th>Page</th><th>For whom</th><th>What it proves</th></tr>
    <tr><td>Overview</td><td>Judges, partners</td><td>Problem in Singapore's own data; the interactive rulebook; a real receipt; portfolio evidence; the brief as a ledger</td></tr>
    <tr><td>Live &amp; replay</td><td>Judges, Income ops</td><td>What is fetched (Data Wire), how every centre settles today, and any past day explained</td></tr>
    <tr><td>Get covered</td><td>Stallholder</td><td>Own gauge, own 12-year history, quote, one SMS, teach-back</td></tr>
    <tr><td>Scenario lab</td><td>Everyone</td><td>Any what-if for a stall or area, minute by minute, with a real SMS</td></tr>
    <tr><td>Actuary studio</td><td>Income underwriting</td><td>Every rule is a control; re-price 120 centres × 12 years; stress and fairness</td></tr>
  </table>
  <p>A <b>13-step guided tour</b> walks this path, spotlighting each feature and performing it (selecting a centre, replaying a storm, playing a simulated day).</p>
  ${fig("02-rulebook.png", 7, "The interactive rulebook — drag readings or load a real recorded day; the decision path lights up exactly as the engine decides.")}
</section>
<section>
  ${fig("08-timemachine.png", 8, "The Weather Time Machine at Tampines: every day since 2014 — paid days by peril, and in red the likely-loss days it would not have paid. Click any day for its receipt.")}
  ${fig("10-studio.png", 9, "The Actuary Studio: every product parameter re-prices the island live.")}
</section>

<!-- ───────────────── 9 SIM & SMS ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#09</span>Scenario lab</div>
  <h2>9 · Scenario lab and real SMS</h2>
  <p>Choose one stall or a whole planning area; set the wettest hour and the time the storm peaks, the highest WBGT, PSI, what NEA forecast the evening before, caps already used and whether the nearest gauge is offline. Playback runs from 6pm the evening before to the close of trading: a 3D rain gauge fills, dials track heat and haze, a timeline marks each level crossing and the moment of payment, and the payout SMS arrives — on screen and, if a gateway is configured, on a real phone.</p>
  ${fig("09-simulate.png", 10, "Flash-flood afternoon at Tiong Bahru: advance SMS the evening before, L1 at 15:30, L2 at 15:45, paid 15:50.")}
  <table><tr><th>Scenario (Tiong Bahru Market)</th><th>Engine verdict</th></tr>
    <tr><td>Flash flood, 78 mm in the wettest hour, heavy storm forecast</td><td>${d.sims.flash}</td></tr>
    <tr><td>62 mm, nearest gauge offline</td><td>${d.sims.outage}</td></tr>
    <tr><td>66 mm, rain cap already used (4/4)</td><td>${d.sims.capped}</td></tr>
    <tr><td>Haze PSI 236 across the Bedok planning area</td><td>${d.bedok.paidCentres} of ${d.bedok.centres} centres paid ${$(d.bedok.perStallTransfer)} per stall (${d.bedok.stalls} stalls)</td></tr>
  </table>
  <h3>SMS delivery</h3>
  <p>Indian (+91) and Singapore (+65) mobile numbers are parsed by one shared function in browser and server. Indian numbers go via Fast2SMS when configured, otherwise Twilio; Singapore numbers via Twilio. Credentials live only in server environment variables; numbers are masked in responses; one message per number every 20 seconds; non-English text is sent as Unicode. Without a gateway the UI says plainly that the message is on screen only. A live Twilio send to a verified Indian number was confirmed <b>delivered</b>.</p>
</section>

<!-- ───────────────── 10 COMPLIANCE ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#10</span>Compliance</div>
  <h2>10 · Compliance with the brief</h2>
  <table><tr><th>Constraint</th><th>How Canopy meets it</th></tr>
    <tr><td>Offered by a licensed insurer (MAS)</td><td>Designed as an Income rider on Stallholder / SmartBiz360; Canopy is the product and engine, not an insurer</td></tr>
    <tr><td>Insurable interest</td><td>Licensed stallholders only; payout sized to verified earnings and kept below modelled loss</td></tr>
    <tr><td>Say plainly when it doesn't pay</td><td>One sentence at sale; per-stall history incl. unpaid bad days; NOT PAID receipts with the reading</td></tr>
    <tr><td>Back-test the trigger</td><td>2014–2026 gauges, PSI, WBGT; forecasts since 2018; results per stall, per area and portfolio</td></tr>
    <tr><td>Indices people act on, with fallback</td><td>MSS gauges, NEA WBGT bands, 24-h PSI bands; next gauge / last snapshot fallback</td></tr>
    <tr><td>Worksite vs station temperature</td><td>Trigger at the station's "High" band; explicit, configurable site offset</td></tr>
    <tr><td>Decide who pays; no permanent subsidy</td><td>Stallholder-paid rider; optional co-pay line with an end date</td></tr>
    <tr><td>Pay when needed</td><td>Settles on each 5-min reading; Prep Pay the evening before</td></tr>
    <tr><td>Cap and pool perils; reinsurance</td><td>One peril per day; per-peril and yearly caps; stop-loss; haze stress test</td></tr>
    <tr><td>Affordability; expenses ≤ 20%</td><td>~${$(weeklyPortfolio, 2)}/week (~0.6% of daily income); expense ratio 20%</td></tr>
    <tr><td>One SMS, customer's language; teach-back</td><td>EN/BM/中文 in one SMS (Tamil two segments); 3-question teach-back before purchase</td></tr>
    <tr><td>PDPA</td><td>Only location, earnings band and phone; SGQR receipts used with consent for verification only; no transaction detail stored</td></tr>
    <tr><td>Explainable AI, no pricing-out (FEAT)</td><td>Published heat model with hold-out error; ±${pct(P.loadings.zoneCap)} cap on location pricing; no personal attributes in price</td></tr>
    <tr><td>Complement statutory cover; no new hardware</td><td>Income loss only (not WICA / property); public instruments only</td></tr>
  </table>
</section>

<!-- ───────────────── 11 LIMITS + 12 ROADMAP ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#11</span>Limitations</div>
  <h2>11 · Limitations, stated plainly</h2>
  <ul>
    <li>MSS daily records give the wettest hour of the day, not whether it fell during trading hours; the live trigger uses trading hours (from 08:00, 5-minute data), so the back-test is slightly conservative on night storms.</li>
    <li>The heat model's hold-out R² is ${d.heat.validation.r2}; heat history is priced probabilistically and live heat payouts use observed WBGT only.</li>
    <li>WBGT history (Feb 2025 →) and the forecast archive are sampled to respect data.gov.sg rate limits; results are annualised accordingly.</li>
    <li>The loss model is an assumption to be calibrated with Income's claims and consented SGQR data.</li>
    <li>Translations are drafts for Income's approved-wording review.</li>
    <li>SMS to India via an international sender may require DLT registration for production volumes; trial accounts deliver only to verified numbers.</li>
  </ul>
  <h2 style="margin-top:8mm">12 · Pilot plan and roadmap</h2>
  <table><tr><th>Phase</th><th>Scope</th><th>Measures of success</th></tr>
    <tr><td>Pilot (6 months)</td><td>3 hawker centres with different risk (e.g. Tampines, Jurong West, Tiong Bahru); 300 stallholders via NTUC</td><td>Take-up ≥ 30%; teach-back pass rate; payout within 5 min of trigger; complaint rate; basis-risk feedback</td></tr>
    <tr><td>Canopy Plus</td><td>Opt-in dual trigger: weather level <i>and</i> a dip in the stall's own SGQR takings (with consent)</td><td>Lower premium; lower basis risk; consent rate</td></tr>
    <tr><td>Outdoor &amp; platform workers</td><td>Same engine with trading-window and income parameters; distribution via NTUC NDCA / NPHVA</td><td>Payouts aligned with MOM heat-stress rest periods</td></tr>
    <tr><td>Risk reduction</td><td>Prep Pay advice, cooling partner discounts, flood-barrier rewards</td><td>Reduced modelled loss on trigger days</td></tr>
  </table>
</section>

<!-- ───────────────── APPENDIX ───────────────── -->
<section>
  <div class="kicker"><span class="plate">#A</span>Appendix</div>
  <h2>Appendix · Architecture and how to run</h2>
  <div class="box mono" style="font-size:8.2pt;white-space:pre-line">scripts/pipeline/   01 stations · 02 MSS daily · 03 PSI · 04 WBGT · 05 hawker centres · 06 forecasts · 07 Changi long record · 08 heat model · 09 planning areas
src/lib/engine/     product spec (zod) · backtest · settle (the rule) · explain (receipts) · pricing · portfolio · loss model
src/lib/live/       cached NEA/MSS feeds (per-feed TTL, incremental rain, stale/fallback) · Data Wire log · forecast archive
src/lib/sms/        phone parsing (SG/IN) · gateways (Fast2SMS, Twilio)
src/app/api/        /meta · /backtest · /portfolio · /live · /replay · /explain · /simulate · /notify
src/app/            / · /live · /cover · /simulate · /studio  (+ 13-step guided tour)</div>
  <div class="box mono" style="font-size:8.6pt;white-space:pre-line">npm install
npm run pipeline            # rebuild the data (resumable)
npm run build &amp;&amp; npm start  # http://localhost:3000
# .env.local (optional): FAST2SMS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, DATA_GOV_SG_API_KEY</div>
  ${fig("03-journey.png", 11, "The life of one payout: storm → gauge → engine → PayNow → SMS.")}
  <p class="small">Figures in this document were produced by the running engine on ${today} from public NEA / MSS / URA data. Canopy is a hackathon prototype designed to be underwritten by Income Insurance Limited; figures are back-tests, not offers of insurance.</p>
</section>
</body></html>`;

fs.writeFileSync(path.join(B, "approach.html"), html);
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
const out = path.join(ROOT, "docs", "Canopy-Approach.pdf");
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-family:monospace;font-size:7px;color:#868170;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>CANOPY · APPROACH &amp; DESIGN</span><span>Singapore–India Hackathon 2026 · Income Insurance</span></div>`,
  footerTemplate: `<div style="font-family:monospace;font-size:7px;color:#868170;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Settled on public NEA / MSS data</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: "17mm", bottom: "18mm", left: "15mm", right: "15mm" },
});
await browser.close();
console.log("wrote", out, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
