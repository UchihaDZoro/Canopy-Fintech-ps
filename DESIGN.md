# Canopy — design & product plan (v2)

## 1. Why v1 felt generic
Dark navy glass cards, gradient serif headlines, pulse-dot pills and emerald accents are the default look of
AI-generated landing pages. The product logic underneath was strong, but the interface didn't *show* it: a judge
couldn't see what data was fetched, which rule fired, or why a stall was or wasn't paid.

## 2. Concept: "The Weather Ledger"
Canopy is insurance that pays on public instruments. The interface should feel like a **field almanac crossed with
a hawker centre**: printed, precise, accountable.

| Element | Choice | Why |
|---|---|---|
| Surface | Warm almanac paper `#F4F1E8`, ink `#16150F`, hairline rules | Reads as a document of record, not a "tech demo"; maximum legibility for judges |
| Instruments | Dark "scope" panels (`#0F1512`, phosphor green) only where live machine data flows | Separates *what the machine sees* from *what the person reads* |
| Type | **Archivo** (variable width: condensed for signage headlines, normal for text) + **IBM Plex Mono** for every number that comes from data | Hawker signage + instrument read-outs; mono = "this is measured" |
| Signal colours | NEA stall-plate green (cover), marigold (money paid), radar blue (rain), kiln orange (heat), haze violet, alert red (lost, not paid) | Each colour has one meaning everywhere |
| Motifs | Stall number plates (`#01-23`) as step labels; **thermal receipts** for every payout decision; registration ticks on panels | Local, memorable, and the receipt *is* the explanation |

## 3. The judge's journey (2 minutes)
1. **Overview** — the problem in Singapore's own records → *the rulebook*, an interactive simulator where you move
   rain / heat / haze and watch the decision path light up → the 3D risk model of the island.
2. **Live** — the **Data Wire**: every NEA/MSS call the engine made, its latency, record count and a raw sample, flowing
   into the trigger engine and out to 120 centres. Click any centre → its **payout receipt**.
3. **Replay** — pick a real day (2021 storm, 2015 haze). The map shows the rain field gauge-by-gauge; a storyboard
   explains *why* N centres paid and why the rest didn't; every centre has a receipt.
4. **Get covered** — a stallholder's flow: stall → gauge → 12-year Time Machine (click any day → receipt) → quote
   → one SMS → teach-back.
5. **Studio** — Income's actuary re-prices the island live.
A **guided tour** (top bar, "Take the tour") walks this path with spotlights, across pages.

## 4. Engineering
- `/api/live` returns a **wire log** (endpoint, time, ms, records, stale/fallback, raw sample) from the cached fetchers.
- `/api/explain` builds a **decision trace** for any location + date: station selection with distances and which
  gauges were online, every peril's reading vs every tier, year-to-date cap usage, the evening-before forecast and
  Prep Pay netting, final transfer. Live days use 5-minute data (with the wettest 60-minute window); historical days
  use MSS daily records.
- `/api/replay` adds the gauge field (all gauges' readings that day), regional PSI and the evening forecast
  (fetched on demand from data.gov.sg and cached when it isn't in the archive).
- No number in the UI is typed in by hand: every figure comes from the engine or the feeds.
