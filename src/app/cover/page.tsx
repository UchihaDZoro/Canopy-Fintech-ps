"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { fetchJson, useApi } from "@/lib/client/api";
import type { BacktestResponse, DecisionTrace, MetaResponse } from "@/lib/client/types";
import { MapView, type MapLayerSpec } from "@/components/map/MapView";
import { Eyebrow, MONEY, Range, Why, sgd } from "@/components/ui";
import { TimeMachine } from "@/components/cover/TimeMachine";
import { QuotePanel } from "@/components/cover/QuotePanel";
import { Honesty } from "@/components/cover/Honesty";
import { PolicyStep } from "@/components/cover/PolicyStep";
import { Receipt, ReceiptSkeleton } from "@/components/receipt/Receipt";
import { haversineKm } from "@/lib/engine/math";
import { useTourAction } from "@/components/tour/Tour";

const STEPS = ["Your stall", "Your earnings", "Your history", "Your policy"];

export default function CoverPage() {
  const meta = useApi<MetaResponse>("/api/meta");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [income, setIncome] = useState(120);
  const [locating, setLocating] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [trace, setTrace] = useState<DecisionTrace | null>(null);

  const hawkers = useMemo(() => (meta.data?.hawkers ?? []).filter((h) => h.stalls > 0), [meta.data]);
  const sel = hawkers.find((h) => h.id === selId) ?? null;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return hawkers.filter((h) => !s || h.name.toLowerCase().includes(s) || h.address.toLowerCase().includes(s)).slice(0, 40);
  }, [hawkers, q]);

  const body = sel ? { lat: sel.lat, lon: sel.lon, label: sel.name, product: { insuredDailyIncome: income } } : null;
  const bt = useApi<BacktestResponse>(sel ? "/api/backtest" : null, body ?? undefined, { debounceMs: 250 });
  const data = bt.data;
  const stage = !sel ? 0 : !data ? 1 : 2;

  const openDay = useCallback(
    (date: string) => {
      if (!sel) return;
      setDay(date);
      setTrace(null);
      fetchJson<DecisionTrace>("/api/explain", { lat: sel.lat, lon: sel.lon, label: sel.name, date, product: { insuredDailyIncome: income } }).then(setTrace);
    },
    [sel, income]
  );

  useTourAction(
    "pick-tampines",
    useCallback(() => {
      const t = hawkers.find((h) => /Tampines Round/i.test(h.name)) ?? hawkers[0];
      if (t) setSelId(t.id);
    }, [hawkers])
  );

  const layers: MapLayerSpec[] = useMemo(() => {
    const st = meta.data?.stations.filter((s) => s.rainDays > 2000) ?? [];
    const used = new Set(data?.backtest.stations.rain.map((s) => s.id) ?? []);
    const first = data?.backtest.stations.rain[0]?.id;
    return [
      {
        id: "gauges",
        interactive: false,
        points: st.map((s) => ({ id: s.id, lon: s.lon, lat: s.lat, props: { used: used.has(s.id), first: s.id === first, name: `${s.id} ${s.name}` } })),
        paint: {
          "circle-radius": ["case", ["get", "first"], 9, ["get", "used"], 6, 3],
          "circle-color": ["case", ["get", "first"], "#1d5fd1", ["get", "used"], "#7ea4e6", "#c9d6ef"],
          "circle-stroke-width": ["case", ["get", "used"], 2, 0.5],
          "circle-stroke-color": "#0b2f75",
        },
        label: { field: "name", minzoom: 12.2, color: "#0b2f75" },
        column: { height: ["case", ["get", "first"], 1500, ["get", "used"], 800, 120], radius: 170, opacity: 0.8 },
      },
      {
        id: "centres",
        points: hawkers.map((h) => ({ id: h.id, lon: h.lon, lat: h.lat, props: { sel: h.id === selId, stalls: h.stalls, name: h.name } })),
        paint: {
          "circle-radius": ["case", ["get", "sel"], 10, ["interpolate", ["linear"], ["get", "stalls"], 10, 4, 200, 8]],
          "circle-color": ["case", ["get", "sel"], MONEY, "#0b6e4f"],
          "circle-stroke-width": ["case", ["get", "sel"], 3, 1.5],
          "circle-stroke-color": ["case", ["get", "sel"], "#16150f", "#f4f1e8"],
        },
        label: { field: "name", minzoom: 13.5 },
        column: { height: ["case", ["get", "sel"], 2200, ["interpolate", ["linear"], ["get", "stalls"], 10, 150, 200, 900]], radius: 160 },
      },
    ];
  }, [meta.data, hawkers, selId, data]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lon: p.coords.longitude };
        const n = [...hawkers].sort((a, b) => haversineKm(here, a) - haversineKm(here, b))[0];
        if (n) setSelId(n.id);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  return (
    <main className="mx-auto max-w-[1400px] px-5 pb-28 pt-28 md:pt-20">
      <div className="border-b-2 border-ink pb-4">
        <Eyebrow n="03">Get covered · the stallholder&apos;s view</Eyebrow>
        <h1 className="sign text-[clamp(2.8rem,6vw,5.6rem)]">Your stall. Your gauge. Your history.</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
          Before paying anything, a stallholder sees which official instruments their cover settles on, and what it would have paid on every day since
          2014 — including the days it wouldn&apos;t have.
        </p>
      </div>

      {/* stepper */}
      <div className="mt-5 grid grid-cols-4 border-2 border-ink">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${i ? "border-l-2 border-ink" : ""} ${i <= stage ? "bg-ink text-paper" : "text-ink-2"}`}>
            <span className={`mono text-[11px] ${i <= stage ? "text-marigold" : "text-ink-3"}`}>0{i + 1}</span>
            <span className="truncate font-semibold">{s}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr] [&>*]:min-w-0">
        <div className="sheet flex flex-col p-5" data-tour="picker">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold">01 · Which hawker centre?</div>
            <button onClick={locate} className="border border-ink px-2.5 py-1 text-[11.5px] hover:bg-paper-2">
              {locating ? "Locating…" : "◎ Near me"}
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${hawkers.length || 120} hawker centres…`}
            className="mt-3 w-full border-2 border-[var(--rule-2)] bg-paper px-3 py-2.5 text-[13.5px] outline-none placeholder:text-ink-3 focus:border-ink"
          />
          <div className="scrollbar-thin mt-2 h-[300px] overflow-y-auto" data-lenis-prevent>
            {meta.loading && !hawkers.length && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton mb-1 h-11" />)}
            {list.map((h) => (
              <button
                key={h.id}
                onClick={() => setSelId(h.id)}
                className={`w-full border-b border-[var(--rule)] px-2 py-2 text-left ${h.id === selId ? "bg-marigold-2" : "hover:bg-paper-2"}`}
              >
                <div className="text-[13px] font-medium">{h.name}</div>
                <div className="mono truncate text-[10.5px] text-ink-3">
                  {h.stalls} stalls · {h.address}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-5 border-t-2 border-ink pt-4">
            <div className="mb-3 text-[14px] font-semibold">02 · A normal day&apos;s take-home</div>
            <Range label="Net earnings per trading day" value={income} min={50} max={400} step={10} onChange={setIncome} format={(v) => sgd(v)} />
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Verified at sign-up from the stall licence and 3 months of PayNow / SGQR receipts (with consent), so payouts match a real loss.
            </p>
          </div>
        </div>

        <figure className="sheet relative flex min-h-[540px] flex-col">
          <div className="flex items-center justify-between border-b border-[var(--rule-2)] px-4 py-2">
            <span className="caps text-ink">Fig. — your stall and the instruments it settles on</span>
            <span className="caps text-ink-3">{sel ? "big blue = your gauge" : "tap a green dot"}</span>
          </div>
          <div className="relative flex-1">
            <MapView className="absolute inset-0" layers={layers} onSelect={(l, id) => l === "centres" && setSelId(id)} fly={sel ? { lon: sel.lon, lat: sel.lat, zoom: 13.2 } : null} />
            <AnimatePresence>
              {sel && data && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-3 top-3 max-w-[360px] border-2 border-ink bg-card p-4 shadow-[4px_4px_0_var(--ink)]">
                  <div className="text-[14px] font-semibold">{sel.name}</div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    {data.backtest.stations.rain.map((s, i) => (
                      <div key={s.id} className="flex justify-between gap-3">
                        <span className={i ? "text-ink-2" : "font-semibold"}>
                          {i === 0 ? "Rain gauge" : `Fallback ${i}`} · <span className="mono">{s.id}</span> {s.name}
                        </span>
                        <span className="mono text-rain">{s.km} km</span>
                      </div>
                    ))}
                    {data.backtest.stations.wbgt && (
                      <div className="flex justify-between gap-3 text-ink-2">
                        <span>Heat · {data.backtest.stations.wbgt.name}</span>
                        <span className="mono text-heat">{data.backtest.stations.wbgt.km} km</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 text-ink-2">
                      <span>Haze · NEA PSI region</span>
                      <span className="mono capitalize text-haze">{data.backtest.stations.region}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </figure>
      </div>

      <AnimatePresence mode="wait">
        {sel && !data && (
          <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-44" />
            ))}
          </motion.div>
        )}
        {sel && data && (
          <motion.section key={sel.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mt-8 space-y-6">
            {bt.loading && <div className="mono text-[11px] text-ink-3">re-pricing…</div>}
            <QuotePanel data={data} />
            <div className="sheet p-5 md:p-7" data-tour="timemachine">
              <Eyebrow n="03">The Weather Time Machine</Eyebrow>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <h2 className="sign-soft text-[clamp(1.8rem,3.4vw,2.8rem)]">
                  Every day at {sel.name.replace(/\s*\(.*\)/, "")}, {data.backtest.period.from.slice(0, 4)}–{data.backtest.period.to.slice(0, 4)}
                </h2>
                <span className="caps text-ink-2">hover to read · click any day for its receipt</span>
              </div>
              <TimeMachine bt={data.backtest} income={income} lossThreshold={data.product.lossModel.lossDayThreshold} onDay={openDay} />
              <Why className="mt-4">
                Schemes whose first season paid nothing lost their customers (SEWA 2023, ZhongAn 2014). Showing every year at the customer&apos;s own
                gauge — the red days included — sets the expectation honestly before they buy.
              </Why>
            </div>
            <Honesty data={data} />
            <div data-tour="sms">
              <PolicyStep data={data} centre={sel} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      {bt.error && <div className="mt-6 border-2 border-alert bg-alert-2 p-4 text-sm text-alert">Couldn&apos;t price this location: {bt.error}</div>}

      {/* receipt drawer */}
      <AnimatePresence>
        {day && (
          <>
            <motion.div className="fixed inset-0 z-[60] bg-[rgba(22,21,15,0.35)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDay(null)} />
            <motion.aside
              initial={{ x: 480 }}
              animate={{ x: 0 }}
              exit={{ x: 480 }}
              transition={{ type: "spring", stiffness: 260, damping: 32 }}
              className="scrollbar-thin fixed bottom-0 right-0 top-14 z-[61] w-[min(460px,100vw)] overflow-y-auto border-l-2 border-ink bg-paper-2 p-5"
              data-lenis-prevent
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="caps text-ink">Settlement receipt · {day}</span>
                <button onClick={() => setDay(null)} className="border border-ink px-2 py-0.5 text-[12px]">
                  Close ✕
                </button>
              </div>
              {trace ? <Receipt t={trace} title={sel?.name} /> : <ReceiptSkeleton />}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
