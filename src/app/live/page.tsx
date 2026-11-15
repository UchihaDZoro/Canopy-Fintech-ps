"use client";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, useApi } from "@/lib/client/api";
import type { DecisionTrace, LiveResponse, MetaResponse, PortfolioResponse, ReplayResponse, Region } from "@/lib/client/types";
import { DEFAULT_PRODUCT } from "@/lib/engine/product";
import { MapView, type MapLayerSpec } from "@/components/map/MapView";
import { DataWire } from "@/components/wire/DataWire";
import { Receipt, ReceiptSkeleton } from "@/components/receipt/Receipt";
import { Eyebrow, MONEY, PERIL_COLOR, PERIL_LABEL, Segmented, Why, sgd } from "@/components/ui";
import { useTourAction } from "@/components/tour/Tour";
import { Storyboard } from "@/components/replay/Storyboard";
import { Freshness } from "@/components/wire/Freshness";
import { DayCards, Verdict } from "@/components/replay/ReplayIntro";

const P = DEFAULT_PRODUCT;
const REGIONS: Region[] = ["north", "west", "central", "east", "south"];
const SEV = ["Fair", "Showers", "Thundery showers", "Heavy thundery showers"];
const POLL_MS = 30_000; // browser polls every 30 s; server refreshes each feed at NEA's own cadence
const STATE_COLOR = { paid: MONEY, watch: "#d2480f", close: "#d2480f", capped: "#868170", clear: "#16150f" } as const;

export default function LivePage() {
  return (
    <Suspense fallback={<div className="h-screen skeleton" />}>
      <Live />
    </Suspense>
  );
}

function Live() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"live" | "replay">(params.get("mode") === "replay" ? "replay" : "live");
  const [selId, setSelId] = useState<string | null>(params.get("centre"));
  const [flyId, setFlyId] = useState<string | null>(params.get("centre"));
  const pick = useCallback((id: string) => {
    setSelId(id);
    setFlyId(id);
  }, []);
  const live = useApi<LiveResponse>("/api/live", undefined, { refreshMs: POLL_MS });
  // When did the browser last receive fresh data? (drives the "checked Xs ago" chip)
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (live.data) setCheckedAt(Date.now());
  }, [live.data]);
  const meta = useApi<MetaResponse>("/api/meta");
  const port = useApi<PortfolioResponse>("/api/portfolio", {});
  const [date, setDate] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [trace, setTrace] = useState<DecisionTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const today = live.data?.now.date ?? null;
  const hawkers = meta.data?.hawkers ?? [];
  const sel = hawkers.find((h) => h.id === selId) ?? null;

  // Load a replay day
  useEffect(() => {
    if (!date) return;
    setLoadingReplay(true);
    setRevealed(0);
    fetchJson<ReplayResponse>("/api/replay", { date })
      .then(setReplay)
      .finally(() => setLoadingReplay(false));
  }, [date]);

  const order = useMemo(() => (replay?.centres ?? []).filter((c) => c.status === "paid").sort((a, b) => a.lon - b.lon), [replay]);
  // The settlement sweep (west → east). `sweep` re-runs it on demand.
  const [sweep, setSweep] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    if (!replay || mode !== "replay") return;
    setRevealed(0);
    const n = order.length;
    if (!n) return;
    setSweeping(true);
    const iv = setInterval(
      () =>
        setRevealed((r) => {
          if (r >= n) {
            clearInterval(iv);
            setSweeping(false);
            return r;
          }
          return r + 1;
        }),
      Math.max(40, 3200 / n)
    );
    return () => clearInterval(iv);
  }, [replay, order, mode, sweep]);
  const revealedIds = useMemo(() => new Set(order.slice(0, revealed).map((c) => c.id)), [order, revealed]);

  // Receipt for the selected centre (live = today, replay = that day)
  const traceDate = mode === "live" ? today : replay?.date ?? null;
  useEffect(() => {
    if (!sel || !traceDate) return setTrace(null);
    setTraceLoading(true);
    // Live receipts re-fetch on every poll so they track the gauges; historical ones are cached
    fetchJson<DecisionTrace>("/api/explain", { lat: sel.lat, lon: sel.lon, label: sel.name, date: traceDate }, { cache: mode !== "live" })
      .then(setTrace)
      .catch(() => setTrace(null))
      .finally(() => setTraceLoading(false));
  }, [sel, traceDate, mode, mode === "live" ? checkedAt : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick the most interesting centre so a receipt is always on screen
  useEffect(() => {
    if (mode === "replay" && replay && !replay.centres.some((c) => c.id === selId && c.status === "paid")) {
      const first = [...replay.centres].sort((a, b) => b.payout - a.payout || (b.rain ?? 0) - (a.rain ?? 0))[0];
      if (first) setSelId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, mode]);

  const presets = useMemo(() => {
    const top = port.data?.topDays ?? [];
    const seen = new Set<string>();
    const out: { date: string; peril: string | null; policies: number }[] = [];
    for (const d of top) {
      if (out.length >= 5) break;
      if (d.peril && seen.has(d.peril) && out.length >= 3) continue;
      if (d.peril) seen.add(d.peril);
      out.push({ date: d.date, peril: d.peril, policies: d.policies });
    }
    return out;
  }, [port.data]);

  // Tour hooks
  const selectBusiest = useCallback(() => {
    setMode("live");
    const c = [...(live.data?.centres ?? [])].sort((a, b) => b.progress - a.progress)[0];
    if (c) pick(c.id);
  }, [live.data, pick]);
  const replayStorm = useCallback(() => {
    setMode("replay");
    setDate("2021-04-17");
  }, []);
  useTourAction("select-busiest", selectBusiest);
  useTourAction("replay-storm", replayStorm);

  // ───── map layers ─────
  const layers: MapLayerSpec[] = useMemo(() => {
    if (mode === "replay") {
      const t1 = replay?.thresholds.rain[0] ?? 50;
      return [
        {
          id: "gauges",
          interactive: false,
          points: (replay?.gauges ?? []).filter((g) => g.r60 !== null).map((g) => ({ id: g.id, lon: g.lon, lat: g.lat, props: { v: g.r60 ?? 0, lbl: (g.r60 ?? 0) >= 10 ? `${g.r60}` : "", over: (g.r60 ?? 0) >= t1 } })),
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 2, 20, 8, 50, 16, 90, 26],
            "circle-color": ["interpolate", ["linear"], ["get", "v"], 0, "#c9d6ef", 20, "#7ea4e6", t1, "#1d5fd1", 90, "#0b2f75"],
            "circle-opacity": 0.55,
            "circle-stroke-width": ["case", ["get", "over"], 2, 0.5],
            "circle-stroke-color": "#0b2f75",
          },
          label: { field: "lbl", minzoom: 10, color: "#0b2f75" },
        },
        { id: "wbgt", interactive: false, points: [], paint: { "circle-radius": 0 } },
        {
          id: "centres",
          points: (replay?.centres ?? []).map((c) => ({
            id: c.id,
            lon: c.lon,
            lat: c.lat,
            props: {
              name: c.name,
              sel: c.id === selId,
              color: c.status === "paid" ? (revealedIds.has(c.id) ? MONEY : "#16150f") : STATE_COLOR[c.status],
              r: c.status === "paid" && revealedIds.has(c.id) ? 7 : 4,
            },
          })),
          paint: {
            "circle-radius": ["case", ["get", "sel"], 10, ["get", "r"]],
            "circle-color": ["get", "color"],
            "circle-stroke-width": ["case", ["get", "sel"], 3, 1.2],
            "circle-stroke-color": ["case", ["get", "sel"], "#16150f", "#f4f1e8"],
          },
          label: { field: "name", minzoom: 13 },
        },
      ];
    }
    const t1 = P.perils.rain.tiers[0].threshold;
    return [
      {
        id: "gauges",
        interactive: false,
        points: (live.data?.rainStations ?? []).map((s) => ({ id: s.id, lon: s.lon, lat: s.lat, props: { v: s.max60Today, lbl: s.max60Today >= 1 ? `${s.max60Today}` : "", over: s.max60Today >= t1 } })),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 3, 10, 7, 50, 16, 90, 24],
          "circle-color": ["interpolate", ["linear"], ["get", "v"], 0, "#d8e2f3", 10, "#7ea4e6", t1, "#1d5fd1"],
          "circle-opacity": 0.6,
          "circle-stroke-width": 0.6,
          "circle-stroke-color": "#1d5fd1",
        },
        label: { field: "lbl", minzoom: 10, color: "#0b2f75" },
      },
      {
        id: "wbgt",
        interactive: false,
        points: (live.data?.wbgtStations ?? []).map((s) => ({ id: `w-${s.id}`, lon: s.lon, lat: s.lat, props: { v: s.maxToday } })),
        paint: {
          "circle-radius": 4.5,
          "circle-color": ["interpolate", ["linear"], ["get", "v"], 27, "#f6d8c8", 31, "#e8875a", 33, "#d2480f"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#d2480f",
        },
      },
      {
        id: "centres",
        points: (live.data?.centres ?? []).map((c) => ({
          id: c.id,
          lon: c.lon,
          lat: c.lat,
          props: { name: c.name, sel: c.id === selId, color: c.state === "paid" ? MONEY : c.state === "watch" ? "#d2480f" : c.prepPay ? "#0b6e4f" : "#16150f" },
        })),
        paint: {
          "circle-radius": ["case", ["get", "sel"], 10, 4.5],
          "circle-color": ["get", "color"],
          "circle-stroke-width": ["case", ["get", "sel"], 3, 1.2],
          "circle-stroke-color": ["case", ["get", "sel"], "#16150f", "#f4f1e8"],
        },
        label: { field: "name", minzoom: 13 },
      },
    ];
  }, [mode, replay, live.data, selId, revealedIds]);

  const flyC = hawkers.find((h) => h.id === flyId);
  const fly = useMemo(() => (flyC ? { lon: flyC.lon, lat: flyC.lat, zoom: 12.4 } : null), [flyC]);
  const watchList = useMemo(() => [...(live.data?.centres ?? [])].sort((a, b) => b.progress - a.progress).slice(0, 6), [live.data]);
  const tomorrow = live.data?.forecast?.tomorrow;

  return (
    <main className="mx-auto max-w-[1400px] px-5 pb-28 pt-28 md:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <Eyebrow n="02">Live &amp; replay</Eyebrow>
          <h1 className="sign text-[clamp(2.8rem,6vw,5.6rem)]">{mode === "live" ? "Singapore, settling right now" : "Replay a real day"}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
            {mode === "live"
              ? "Today's official readings, fetched from NEA and MSS, matched to every hawker centre's own gauge — and the receipt for any stall."
              : "Re-run any day since 2014 from the official record. See the rain field, who was paid, why the rest weren't, and the receipt for each stall."}
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === "replay" && !date) setDate(presets[0]?.date ?? "2021-04-17");
          }}
          options={[
            { id: "live", label: "● Live now" },
            { id: "replay", label: "↺ Replay a real day" },
          ]}
        />
      </div>

      {mode === "live" ? (
        <>
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-ink-2">
                Updates on its own — no need to reload. Gauges report every 5 minutes, heat every 15, haze hourly.
              </span>
              <Freshness at={checkedAt} everyMs={POLL_MS} loading={live.loading} source={live.data?.feeds.rain?.at ? new Date(live.data.feeds.rain.at).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false }) : null} />
            </div>
            <DataWire live={live.data} />
            <Why className="mt-3">
              Parametric insurance is only as trustworthy as its data. This panel shows every request the engine made to the government&apos;s open-data
              API in this session — endpoint, latency, how many instruments answered, and a raw reading — and whether a fallback was used.
            </Why>
          </div>

          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_420px]">
            <figure className="sheet flex flex-col" data-tour="livemap">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-2)] px-4 py-2">
                <span className="caps text-ink">Fig. — every centre on its own gauge, today since 08:00</span>
                <span className="caps text-ink-3">click a centre for its receipt</span>
              </div>
              <div className="relative h-[560px]">
                <MapView className="absolute inset-0" layers={layers} pitch={0} zoom={10.9} onSelect={(l, id) => l === "centres" && pick(id)} fly={fly} />
              </div>
              <Legend live />
            </figure>
            <div className="flex flex-col gap-4">
              <div data-tour="receipt">
                {sel ? (
                  traceLoading && !trace ? <ReceiptSkeleton /> : trace ? <Receipt t={trace} title={sel.name} /> : <ReceiptSkeleton />
                ) : (
                  <div className="sheet p-5">
                    <div className="caps text-ink-3">Closest to a trigger right now</div>
                    <div className="mt-3 space-y-1">
                      {watchList.map((c) => (
                        <button key={c.id} onClick={() => pick(c.id)} className="flex w-full items-center gap-3 border-b border-[var(--rule)] py-2 text-left hover:bg-paper-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.state === "paid" ? MONEY : c.state === "watch" ? "#d2480f" : "#16150f" }} />
                          <span className="flex-1 truncate text-[13px]">{c.name}</span>
                          <span className="mono text-[11px] text-ink-2">{Math.round(c.progress * 100)}% to L1</span>
                        </button>
                      ))}
                      {!watchList.length && <div className="skeleton h-40" />}
                    </div>
                    <p className="mt-3 text-[12px] text-ink-3">Pick any centre on the map to print its settlement receipt for today.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="sheet mt-6 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="caps text-ink">Tonight&apos;s Prep Pay decision · tomorrow&apos;s daytime outlook by region</span>
              <span className="caps text-ink-3">{live.data?.forecast?.source ?? "…"}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              {REGIONS.map((r) => {
                const sev = tomorrow?.sev[r] ?? 0;
                const go = sev >= P.prepPay.minSeverity;
                return (
                  <div key={r} className={`border-2 p-3 ${go ? "border-plate bg-plate-2" : "border-[var(--rule-2)]"}`}>
                    <div className="caps text-ink-3">{r}</div>
                    <div className="mt-1 text-[14px] font-semibold">{tomorrow ? tomorrow.text[r] || SEV[sev] : "—"}</div>
                    <div className={`mono mt-1 text-[12px] font-semibold ${go ? "text-plate" : "text-ink-3"}`}>{go ? `SEND ${sgd(P.prepPay.advancePct * P.insuredDailyIncome)} at 6pm` : "hold"}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] text-ink-2">
              Rule: an advance goes out only when the region is forecast &ldquo;{SEV[P.prepPay.minSeverity].toLowerCase()}&rdquo; or a high ≥ {P.prepPay.heatForecastC}°C
              (forecast high today {live.data?.forecast?.high ?? "—"}°C), up to {P.prepPay.maxPerYear} a year, taken off the next payout.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="caps text-ink">Pick a day · the biggest days in the record, or any date since 2014</span>
              {loadingReplay && <span className="mono text-[12px] text-ink-3">settling 120 centres on {date}…</span>}
            </div>
            <DayCards days={presets} value={date} onPick={setDate} min="2014-04-01" max={meta.data?.coverage.rainTo ?? undefined} />
          </div>

          {replay && (
            <div className={loadingReplay ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <Verdict r={replay} revealed={Math.min(revealed, replay.summary.centresPaid)} playing={sweeping} onReplay={() => setSweep((x) => x + 1)} />
              <Storyboard r={replay} revealed={Math.min(revealed, replay.summary.centresPaid)} />
            </div>
          )}

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_420px]">
            <figure className="sheet flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-2)] px-4 py-2">
                <span className="caps text-ink">Fig. — the rain field on {replay?.date ?? "…"} · bubbles = each gauge&apos;s wettest hour (mm)</span>
                <span className="caps text-ink-3">click a centre</span>
              </div>
              <div className="relative h-[560px]">
                <MapView className="absolute inset-0" layers={layers} pitch={0} zoom={10.9} onSelect={(l, id) => l === "centres" && pick(id)} fly={fly} />
                {replay && (
                  <div className="absolute right-3 top-3 border border-[var(--rule-2)] bg-card/95 p-2.5">
                    <div className="caps text-ink-3">24-h PSI by region</div>
                    <div className="mt-1 grid grid-cols-5 gap-2">
                      {replay.regions.map((r) => (
                        <div key={r.region} className="text-center">
                          <div className="mono text-[13px] font-semibold" style={{ color: (r.psi ?? 0) >= (replay.thresholds.haze[0] ?? 101) ? PERIL_COLOR.haze : "var(--ink)" }}>
                            {r.psi ?? "—"}
                          </div>
                          <div className="text-[9.5px] text-ink-3">{r.region}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Legend />
            </figure>
            <div data-tour="receipt">{sel && trace ? <Receipt t={trace} title={sel.name} /> : <ReceiptSkeleton />}</div>
          </div>

          {replay && <Ledger r={replay} selId={selId} onPick={pick} />}
        </>
      )}
    </main>
  );
}

function Legend({ live }: { live?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--rule-2)] px-4 py-2 text-[11.5px] text-ink-2">
      <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border border-rain bg-rain/40" /> rain gauge (size = wettest hour)</span>
      {live && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border-2 border-heat bg-heat-2" /> WBGT station</span>}
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: MONEY }} /> centre paid</span>
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-heat" /> {live ? "≥ 60% of the way to a level" : "close (≥ 70% of level 1)"}</span>
      {live && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-plate" /> Prep Pay tonight</span>}
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-ink" /> not triggered</span>
    </div>
  );
}

function Ledger({ r, selId, onPick }: { r: ReplayResponse; selId: string | null; onPick: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "paid" | "close" | "clear">("all");
  const rows = useMemo(() => {
    const rank = { paid: 0, capped: 1, close: 2, clear: 3 } as const;
    return [...r.centres].filter((c) => filter === "all" || c.status === filter).sort((a, b) => rank[a.status] - rank[b.status] || b.payout - a.payout || (b.rain ?? 0) - (a.rain ?? 0));
  }, [r, filter]);
  return (
    <div className="sheet mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-2)] px-4 py-2">
        <span className="caps text-ink">Settlement ledger · {r.date} · every centre, with the reason</span>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: `All ${r.centres.length}` },
            { id: "paid", label: `Paid ${r.summary.centresPaid}` },
            { id: "close", label: `Close ${r.summary.close}` },
            { id: "clear", label: `Below ${r.summary.clear}` },
          ]}
        />
      </div>
      <div className="scrollbar-thin max-h-[420px] overflow-y-auto" data-lenis-prevent>
        <table className="w-full text-[12.5px]">
          <thead className="caps sticky top-0 bg-card text-ink-3">
            <tr className="text-left">
              <th className="px-4 py-2 font-normal">Centre</th>
              <th className="py-2 font-normal">Gauge</th>
              <th className="py-2 text-right font-normal">Wettest hour</th>
              <th className="py-2 text-right font-normal">PSI</th>
              <th className="py-2 pl-6 font-normal">Why</th>
              <th className="px-4 py-2 text-right font-normal">Paid</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((c) => (
                <motion.tr
                  key={c.id}
                  layout
                  onClick={() => onPick(c.id)}
                  className={`cursor-pointer border-t border-[var(--rule)] ${c.id === selId ? "bg-marigold-2" : "hover:bg-paper-2"}`}
                >
                  <td className="px-4 py-1.5">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: STATE_COLOR[c.status] }} />
                    {c.name}
                  </td>
                  <td className="mono py-1.5 text-ink-2">{c.station ?? "—"}</td>
                  <td className="mono py-1.5 text-right">{c.rain ?? "—"}</td>
                  <td className="mono py-1.5 text-right">{c.psi ?? "—"}</td>
                  <td className="py-1.5 pl-6 text-ink-2">{c.why}</td>
                  <td className="mono px-4 py-1.5 text-right font-semibold" style={{ color: c.payout ? MONEY : "var(--ink-3)" }}>
                    {c.payout ? sgd(c.payout) : "—"}
                    {c.peril ? <span className="ml-1 text-[10px] font-normal" style={{ color: PERIL_COLOR[c.peril] }}>{PERIL_LABEL[c.peril].split(" ")[0].toLowerCase()}</span> : null}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
