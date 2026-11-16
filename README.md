# Daycover+ — climate income cover for Singapore's hawkers

**Singapore–India Hackathon 2026 · FinTech / InsurTech track (Income Insurance)**

> *How might we reimagine insurance, powered by data and AI, so that climate risk protection becomes affordable, accessible and actionable for every vulnerable household and SME in Singapore?*

Daycover+ is a parametric income cover for hawkers and stallholders, designed to be underwritten by Income as a rider on Stallholder / SmartBiz360. It pays on **official NEA and MSS readings at the stall's own nearest gauge**. Every rule is **back-tested on 2014–2026 records** across all 123 NEA hawker centres. Nothing in the product is a hard-coded number: every trigger, payout, cap and loading is a parameter you can change in the Actuary Studio, and the island is re-priced live.

## What makes it different

| | Idea | Why it matters (from the brief) |
|---|---|---|
| 1 | **Prep Pay**: a small advance at 6pm when NEA forecasts a heavy storm or heat spike for your region tomorrow, taken off your next payout (never owed back), up to 4 a year | "Pay when claimants need it most". The Delhi heatwave trial found forecast-day payments cut lost workdays by about two-thirds. Back-tested against **archived NEA evening forecasts since 2018**. |
| 2 | **Settled on the gauge you can see**: nearest working MSS gauge with automatic fallback, NEA WBGT bands and regional 24-h PSI; tiers make the no-pay level obvious | Uses indices people already act on, with a feed-failure fallback. Basis risk is **measured** (how often neighbouring gauges agree), not ignored. |
| 3 | **Weather Time Machine**: every day since 2014 at the customer's own centre, including the bad days it would *not* have paid; then a 3-question teach-back in EN / 中文 / BM / தமிழ் | "Say plainly when it doesn't pay", "back-test the trigger", "customers can say back what the product does". |

## Results with the default design (all computed from the data)

- **Price:** about **S$5 / week** for S$120/day of insured earnings (~0.6% of daily income; the Philippines caps micro-premiums at 7.5% of the daily minimum wage).
- **Paid in every one of the 13 years** at the sample centres, so no customer sits through an empty first season.
- **Portfolio** (123 centres, 30% take-up):
  - About 2,000 policies, **loss ratio ≈ 59%** (σ ≈ 5% year to year).
  - Expenses held at 20% of premium.
- **Concurrency:**
  - Worst day: 17 Apr 2021 storm, about 750 stalls paid at once.
  - 2015 haze: about 1,900 stalls paid at once.
- **Haze stress test:** priced explicitly, with aggregate stop-loss reinsurance.
- **Fairness:** raw location risk ranges about ±30%. Premiums are capped at ±15% of the island average so exposed areas aren't priced out (MAS FEAT).

## Pages

A **guided tour** (top-right, "Take the 2-min tour") walks a judge through all five pages in 13 steps. It spotlights each feature and performs it (selects a centre, replays a storm, plays a simulated day). `←` / `→` step through it; `Esc` closes it.

| Route | What it shows |
|---|---|
| `/` | Front page: the island as a paper 3D model (55 URA planning areas raised by back-tested risk, rain mirroring live gauges); a live-reading ticker; the Changi climate record; the **interactive rulebook** (drag the readings, watch the decision path; presets load real recorded days); the life of a payout as a motion graphic; a real settlement **receipt**; the portfolio loss ratio; the brief as a ledger with links to where each answer is shown |
| `/live` | **Live:** the **Data Wire** (every NEA/MSS request, with endpoint, latency, instrument count, raw sample, cache/fallback status, and an animated flow into the engine); a map of every gauge and centre today; a receipt for any centre; tonight's Prep Pay decision by region. **Replay:** any day since 2014, with a four-frame storyboard (evening forecast → rain-field histogram → settlement → why the others weren't paid), the rain field on the map, a receipt per centre, and a settlement ledger of all 120 centres with reasons |
| `/cover` | The stallholder's flow: pick a centre → matched gauges → earnings → quote and premium build-up → Weather Time Machine (click any day for its receipt) → honesty panel → one-SMS policy in 4 languages → teach-back → policy card |
| `/simulate` | **Scenario lab:** for one stall or a whole planning area, set the rain, storm time, heat, haze, evening forecast, caps already used, a gauge outage and insured income. A 3D rain gauge fills minute by minute, dials track heat and haze, a timeline marks each level crossing and the settlement, and the payout SMS arrives on the phone. It can also be **sent to a real number** (see below). It uses the same `settle()` function as real settlements |
| `/studio` | Actuary Studio: every product parameter, V3 climate scenarios, re-pricing of 12 years × 120 centres, loss ratio by year, haze stress test, worst concurrent days, fairness by region, explainable heat model card, data lineage |

Every payout decision, live, historical or simulated, renders as a **thermal receipt**. It shows which gauge counted and why (offline gauges skipped), each reading against each printed level, caps used that year, the evening-before forecast with Prep Pay netting, the PayNow transfer and a PAID / NOT PAID / CAPPED stamp.

### Sending real SMS (India and Singapore)

In the Scenario lab, choose 🇮🇳 +91 or 🇸🇬 +65, enter a mobile number and press **Play & send SMS**. The payout message is sent at the moment the settlement happens in the simulation. A status box under the number shows, before you send, whether a real gateway is set up.

| Number | Gateway used | What to set in `.env.local` |
|---|---|---|
| India `+91` (10 digits, 6–9) | **Fast2SMS** (Quick SMS route, no DLT template needed) | `FAST2SMS_API_KEY` |
| India, if Fast2SMS isn't set | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Singapore `+65` (8 digits, 8/9) | Twilio | same three Twilio values |

1. Copy `.env.example` to `.env.local` and fill in the keys. Get the Fast2SMS key at fast2sms.com → Dev API. For Twilio, use the Account SID, Auth Token and a Twilio number from the Twilio console.
2. Restart the app (`npm start`). The Scenario lab then shows "Real SMS via Fast2SMS" (or Twilio).

Notes:
- **Twilio trial accounts** only deliver to numbers verified in the Twilio console.
- **Both providers** may need sender or DLT registration for production traffic to India.
- **Number formats:** accepted as `98765 43210`, `098765 43210`, `+91 98765-43210`, `9123 4567` and `+65 9123 4567`.
- **Encoding:** non-English messages (中文, தமிழ்) are sent as Unicode.
- **Safety:** numbers are masked in responses, with one message per number every 20 s.
- **No keys set:** the message is shown on the on-screen phone and the UI says plainly that no SMS was sent.

Tested against a local stand-in for both APIs. It checked routing (+91 → Fast2SMS, +65 → Twilio), the exact request each gateway receives, Unicode encoding, validation and the rate limit. It has not been tested with live accounts.

## Data (all public, independent, verifiable)

| Source | Use |
|---|---|
| MSS historical daily records (weather.gov.sg), 55 gauges, 2010→ | Wettest 30/60/120-min rainfall, temperature — rain trigger back-test |
| MSS Changi S24, 1981→ | Long-run climate signal (+0.86°C mean, 9.5 → 15.2 hot days/yr) |
| NEA WBGT (data.gov.sg), 30 stations, Feb 2025→ | Live heat trigger; calibration of the heat model |
| NEA historical 24-h PSI (data.gov.sg), Apr 2014→ | Haze trigger back-test (2015 peak 322) |
| NEA 24-hour forecasts (data.gov.sg), 2018→ | Prep Pay back-test (evening issue) and live decision; 4-day outlook as fallback |
| NEA real-time rainfall / WBGT / PSI / 2-h nowcast | Live console |
| NEA hawker centres GeoJSON | Real exposure: 123 centres, 6,665 cooked-food stalls |
| URA Master Plan 2019 planning areas | 3D island and area risk |

## AI and models, explainably (MAS FEAT)

- **Heat model:** NEA WBGT only exists from Feb 2025. To price heat over 12 years, a *published linear model* maps MSS daily Tmax / Tmean / rain / season to daily max WBGT. It's validated on a time-based hold-out (MAE ≈ 0.86°C; R² is modest because daily records lack humidity). Each historical day is priced by the **probability** WBGT crossed the trigger, using the residual σ. **Live payouts always use observed WBGT.**
- **Basis risk:** for every location the engine measures how often the nearest gauge triggers when the next-nearest does (about 36% at Tampines), so spatial basis risk is visible in the product, not hidden.
- **Prep Pay skill:** measured against 717 archived NEA evening forecasts (2018–2026). Regional "heavy thundery showers" alerts come about 25 times a year, but only about 2% are followed by a trigger at a given gauge (half of all payouts were forewarned). Paid as a gift, the advances would have nearly doubled the premium, to about S$9/wk. So Prep Pay is designed as an **advance on the next payout**: capped at 4 a year, deducted from later payouts, never owed back. The customer still gets cash the evening before, and the back-tested cost to the pool is about S$0.
- **Loss model:** a transparent revenue-drop function (editable) sizes payouts to expected loss and powers the "days you'd have lost and not been paid" disclosure.

## Run it

```bash
npm install
npm run pipeline      # downloads + builds src/data/generated (resumable; raw cache in data/raw)
npm run dev           # http://localhost:3000 (development)
```

For a demo, use a production build: no first-visit compile, so every page and API answers immediately.

```bash
npm run build && npm start
```

Generated data is committed under `src/data/generated`, so the app runs without re-running the pipeline. A free data.gov.sg API key (`DATA_GOV_SG_API_KEY`) speeds up the WBGT and forecast history steps, which are rate-limited anonymously. Re-run single steps with e.g. `npm run pipeline -- 04 08`.

## Architecture

```
scripts/pipeline/        01 stations · 02 MSS daily · 03 PSI · 04 WBGT · 05 hawker centres
                         06 forecasts · 07 Changi long record · 08 heat model fit · 09 planning areas
src/lib/engine/          product spec (zod) · back-test · pricing · portfolio · loss model
src/lib/live/            cached live NEA feeds (stale-while-revalidate, last-good fallback) · trigger status
src/lib/engine/settle.ts the settlement rule (levels → one peril → caps → Prep Pay), shared by receipts and the simulator
src/lib/engine/explain.ts decision traces (receipts) for live, historical and simulated days
src/app/api/             /backtest · /portfolio · /live · /replay · /meta · /explain · /simulate · /notify
src/app/                 / · /live · /cover · /simulate · /studio
DESIGN.md                design and product rationale ("The Weather Ledger")
```

## Honest limitations / roadmap

- Daily MSS records give the wettest hour of the day, not whether it fell during trading hours. The live trigger *does* use trading hours (from 08:00, 5-min data); the back-test is therefore slightly conservative on night storms.
- Translations are drafts for Income's approved-wording review. Tamil needs 2 SMS segments; EN / BM / 中文 fit in one.
- **Roadmap — Daycover+ Max:** an opt-in dual trigger that also checks a dip in the stall's own PayNow / SGQR takings (with consent), for a cheaper premium and lower basis risk. It's not in this build, because it needs real merchant data rather than invented data.
- Platform workers (NTUC NDCA/NPHVA) reuse the same engine with trading-window and income parameters; hawkers are the launch segment because they match the case study (SmartBiz360 / Stallholder).

*Prototype for a hackathon. Figures are back-tests, not offers of insurance.*
