export interface TourStep {
  route: string;
  target: string; // CSS selector (data-tour attribute)
  title: string;
  body: string;
  place?: "right" | "left" | "auto";
  action?: string; // window event `tour:<action>` the page performs as a demo
}

// The judge's 2-minute path: problem → rule → evidence → live → replay → customer → insurer.
export const TOUR_STEPS: TourStep[] = [
  {
    route: "/",
    target: "[data-tour=hero]",
    title: "Insurance that pays on a public reading",
    body: "Canopy is income cover for hawkers, underwritten by Income. No claim forms: it pays when an official NEA / MSS instrument near your stall crosses a printed level.",
    place: "right",
  },
  {
    route: "/",
    target: "[data-tour=problem]",
    title: "The problem, from Singapore's own records",
    body: "Every figure here is computed from MSS and NEA data: hotter years, more haze, and 6,665 hawker stalls with no cover for the income they lose.",
  },
  {
    route: "/",
    target: "[data-tour=rulebook]",
    title: "The whole product is this rulebook",
    body: "Drag the readings. The decision path lights up exactly as the engine decides: which peril, which tier, how much — and the level below which it pays nothing.",
    place: "auto",
  },
  {
    route: "/",
    target: "[data-tour=island]",
    title: "12 years, every neighbourhood",
    body: "Each planning area is raised by its back-tested payout risk. Drag to rotate. This is the evidence base the price is built on.",
  },
  {
    route: "/live",
    target: "[data-tour=wire]",
    title: "The Data Wire — what we fetch, live",
    body: "Every call the engine makes to data.gov.sg: endpoint, time, latency, how many stations reported, and the raw reading. If a feed fails, the fallback is shown here.",
    place: "right",
  },
  {
    route: "/live",
    target: "[data-tour=livemap]",
    title: "120 centres, each on its own gauge",
    body: "Bubbles are rain gauges sized by today's wettest hour. Centres turn marigold when paid, orange when close. Nothing is estimated: it's today's readings.",
    action: "select-busiest",
  },
  {
    route: "/live",
    target: "[data-tour=receipt]",
    title: "Every decision prints a receipt",
    body: "Station chosen and why, each reading against each tier, caps used, Prep Pay netting, and the transfer. This is the explanation a stallholder — or MAS — gets.",
    place: "left",
  },
  {
    route: "/live",
    target: "[data-tour=storyboard]",
    title: "Replay a real storm: 17 April 2021",
    body: "We re-run the day from the record. The storyboard explains why these centres paid and why the others didn't — gauge by gauge.",
    action: "replay-storm",
    place: "right",
  },
  {
    route: "/cover",
    target: "[data-tour=picker]",
    title: "The stallholder's view",
    body: "Pick a hawker centre. Canopy matches it to the nearest working gauge, WBGT station and PSI region — with fallbacks if one goes offline.",
    action: "pick-tampines",
    place: "right",
  },
  {
    route: "/cover",
    target: "[data-tour=timemachine]",
    title: "12 years at your stall, before you pay",
    body: "Every day since 2014: paid days, and — just as visibly — bad days it would NOT have paid. Click any day for its receipt.",
  },
  {
    route: "/cover",
    target: "[data-tour=sms]",
    title: "One SMS, four languages, then a check",
    body: "The whole policy fits a single SMS in English, Malay or Chinese. A 3-question teach-back must be passed before buying.",
  },
  {
    route: "/simulate",
    target: "[data-tour=sim-stage]",
    title: "Simulate any day, at any stall",
    body: "Set a storm at 3pm, a haze week or a gauge outage. The same settlement engine decides, minute by minute: the gauge fills, levels are crossed, and the payout SMS is sent — to any number you enter.",
    action: "sim-run",
    place: "left",
  },
  {
    route: "/studio",
    target: "[data-tour=studio]",
    title: "For Income's actuary",
    body: "Change any trigger, cap, climate scenario or loading, and 12 years × 120 centres re-price in about two seconds — loss ratio, stress test and fairness included.",
  },
];
