"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/client/api";
import type { DecisionTrace, MetaResponse } from "@/lib/client/types";
import { DEFAULT_PRODUCT as P } from "@/lib/engine/product";
import { LANGS, type Lang } from "@/lib/i18n/policy";
import { advanceSms, payoutSms } from "@/lib/i18n/messages";
import { buildDay, DAY_END, DAY_START, hhmm, N } from "@/lib/client/scenario";
import { Eyebrow, MONEY, PERIL_COLOR, Range, Segmented, Toggle, Why, sgd } from "@/components/ui";
import { Dial } from "@/components/sim/Dial";
import { Receipt, ReceiptSkeleton } from "@/components/receipt/Receipt";
import { MapView, type MapLayerSpec } from "@/components/map/MapView";
import { useTourAction } from "@/components/tour/Tour";
import { COUNTRIES, parsePhone, type Country } from "@/lib/sms/phone";

const RainGauge3D = dynamic(() => import("@/components/sim/RainGauge3D"), { ssr: false, loading: () => <div className="h-full w-full skeleton" /> });

type Target = { kind: "centre"; id: string } | { kind: "area"; name: string };
interface SimResult {
  area: string | null;
  results: { id: string; name: string; lat: number; lon: number; stalls: number; gauge: string | null; loss: number; trace: DecisionTrace }[];
  summary: { centres: number; stalls: number; paidCentres: number; perStallTransfer: number; advance: number; likelyLoss: number };
}
const SEV = ["Fair", "Showers", "Thundery showers", "Heavy thundery showers"];
const DURATION = 12_000;
const EVENING = 0.12; // share of the animation spent on the evening before

// Scenario templates: starting points for a what-if, not records.
const PRESETS = [
  { id: "flash", label: "Flash-flood afternoon", v: { rain: 78, peak: 15.5, heat: 30.2, haze: 42, sev: 3, high: 32, outage: false, used: { rain: 1, heat: 0, haze: 0 } } },
  { id: "near", label: "Near miss", v: { rain: 47, peak: 16, heat: 30.5, haze: 40, sev: 2, high: 32, outage: false, used: { rain: 0, heat: 0, haze: 0 } } },
  { id: "haze", label: "Haze week", v: { rain: 0, peak: 15, heat: 31, haze: 236, sev: 0, high: 33, outage: false, used: { rain: 0, heat: 0, haze: 2 } } },
  { id: "heat", label: "Heatwave", v: { rain: 0, peak: 15, heat: 34.3, haze: 60, sev: 0, high: 35, outage: false, used: { rain: 0, heat: 1, haze: 0 } } },
  { id: "outage", label: "Gauge offline", v: { rain: 62, peak: 14, heat: 30, haze: 45, sev: 3, high: 32, outage: true, used: { rain: 0, heat: 0, haze: 0 } } },
  { id: "capped", label: "Cap used up", v: { rain: 66, peak: 17, heat: 30, haze: 40, sev: 2, high: 32, outage: false, used: { rain: 4, heat: 1, haze: 0 } } },
];

export default function SimulatePage() {
  const meta = useApi<MetaResponse>("/api/meta");
  const hawkers = useMemo(() => (meta.data?.hawkers ?? []).filter((h) => h.stalls > 0), [meta.data]);
  // Only areas that actually contain a hawker centre (same point-in-polygon test as the server)
  const areasWithCentres = useMemo(() => {
    const inRing = (lon: number, lat: number, ring: [number, number][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    return (meta.data?.areas ?? [])
      .map((a) => ({ name: a.name, n: hawkers.filter((h) => a.rings.some((r) => inRing(h.lon, h.lat, r))).length }))
      .filter((a) => a.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [meta.data, hawkers]);

  const [mode, setMode] = useState<"centre" | "area">("centre");
  const [centreId, setCentreId] = useState("HC2");
  const [area, setArea] = useState("BEDOK");
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState("flash");
  const [rain, setRain] = useState(78);
  const [peak, setPeak] = useState(15.5);
  const [heat, setHeat] = useState(30.2);
  const [haze, setHaze] = useState(42);
  const [sev, setSev] = useState(3);
  const [high, setHigh] = useState(32);
  const [used, setUsed] = useState({ rain: 1, heat: 0, haze: 0 });
  const [outage, setOutage] = useState(false);
  const [income, setIncome] = useState(P.insuredDailyIncome);
  const [lang, setLang] = useState<Lang>("en");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country>("IN");
  const gateways = useApi<{ configured: { fast2sms: boolean; twilio: boolean }; route: Record<Country, "fast2sms" | "twilio" | null> }>("/api/notify");
  const [sendReal, setSendReal] = useState(false);

  const target: Target = mode === "centre" ? { kind: "centre", id: centreId } : { kind: "area", name: area };
  const body = useMemo(
    () => ({ target, readings: { rain, heat, haze }, forecast: { sev, high }, usedBefore: used, gaugeOutage: outage, product: { insuredDailyIncome: income } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, centreId, area, rain, heat, haze, sev, high, used, outage, income]
  );
  const sim = useApi<SimResult>("/api/simulate", body, { debounceMs: 250 });
  const r = sim.data;
  const first = r?.results[0];
  const trace = first?.trace;

  const applyPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setRain(p.v.rain);
    setPeak(p.v.peak);
    setHeat(p.v.heat);
    setHaze(p.v.haze);
    setSev(p.v.sev);
    setHigh(p.v.high);
    setOutage(p.v.outage);
    setUsed(p.v.used);
  }, []);
  const custom = () => setPreset("custom");

  // ───────────── the day, and playback ─────────────
  const rainLv = P.perils.rain.tiers.map((t) => t.threshold);
  const heatLv = P.perils.heat.tiers.map((t) => t.threshold);
  const day = useMemo(() => buildDay(rain, peak, heat, rainLv, heatLv), [rain, peak, heat]); // eslint-disable-line react-hooks/exhaustive-deps
  const [p, setP] = useState(1); // playback progress 0..1 (1 = end of day)
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    setPlaying(true);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION);
      setP(k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const hourNow = p <= EVENING ? DAY_START : DAY_START + ((p - EVENING) / (1 - EVENING)) * (DAY_END - DAY_START);
  const idx = Math.min(N - 1, Math.max(0, Math.round(((hourNow - DAY_START) * 60) / 5)));
  const evening = p < EVENING;
  const wettestSoFar = evening ? 0 : Math.max(0, ...day.hour.slice(0, idx + 1));
  const rainingNow = evening ? 0 : day.rain[idx] / Math.max(1e-9, Math.max(...day.rain));
  // Like the rain gauge, the heat dial shows the highest reading so far — that is what the payout uses
  const wbgtNow = evening ? heat - 4 : Math.max(...day.wbgt.slice(0, idx + 1));

  // When is the money paid? At the first crossing of the winning level (+5 min) — or day end.
  const settleHour = useMemo(() => {
    if (!trace) return DAY_END;
    const d = trace.decision;
    if (d.verdict !== "paid" || !d.peril) return DAY_END;
    if (d.peril === "rain") return Math.min(DAY_END, (day.crossRain[d.tier - 1] ?? DAY_END) + 5 / 60);
    if (d.peril === "heat") return Math.min(DAY_END, (day.crossHeat[d.tier - 1] ?? 14) + 5 / 60);
    return DAY_START + 5 / 60; // 24-h PSI already above the level when trading opens
  }, [trace, day]);
  const settled = !evening && hourNow >= settleHour - 1e-6;
  const advanceShown = trace?.prepPay.sent && p >= EVENING * 0.55;

  const ref = useMemo(() => `CNP-${(first?.id ?? "X").replace("HC", "")}-${Math.abs(rain * 7 + heat * 3 + haze).toFixed(0)}`, [first, rain, heat, haze]);
  const centreName = first?.name.replace(/\s*\(.*\)/, "") ?? "your stall";
  const payoutText = trace
    ? payoutSms(lang, {
        centre: centreName,
        peril: trace.decision.peril,
        value: trace.decision.peril ? trace.perils.find((x) => x.peril === trace.decision.peril)!.value : null,
        gauge: trace.decision.peril === "rain" ? trace.gauges.find((g) => g.used)?.id ?? null : null,
        gross: trace.decision.gross,
        deducted: trace.decision.advanceDeducted,
        transfer: trace.decision.transfer,
        ref,
      })
    : "";
  const advText = trace?.prepPay.sent ? advanceSms(lang, centreName, trace.prepPay.amount, SEV[sev]) : "";

  // Real delivery: fires once when the settlement moment is reached during a "run & send"
  const [delivery, setDelivery] = useState<{ state: "idle" | "sending" | "sent" | "simulated" | "failed"; detail?: string }>({ state: "idle" });
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sendReal || !settled || !trace || !playing) return;
    const key = `${ref}-${payoutText}`;
    if (firedFor.current === key) return;
    firedFor.current = key;
    setDelivery({ state: "sending" });
    // Raw fetch: we want the gateway's explanation even when it answers with an error status
    fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: phone, country, body: payoutText }) })
      .then((x) => x.json())
      .then((res: { status: string; to?: string; provider?: string; providerStatus?: string; note?: string; error?: string }) =>
        setDelivery({
          state: res.status === "sent" ? "sent" : res.status === "simulated" ? "simulated" : "failed",
          detail:
            res.status === "sent"
              ? `${res.provider} accepted it for ${res.to}${res.providerStatus ? ` (${res.providerStatus})` : ""}`
              : res.status === "simulated"
                ? res.note
                : `${res.provider ? `${res.provider}: ` : ""}${res.error}`,
        })
      )
      .catch((e) => setDelivery({ state: "failed", detail: String(e.message ?? e) }));
  }, [sendReal, settled, trace, playing, phone, country, payoutText, ref]);

  const parsedPhone = useMemo(() => parsePhone(phone, country), [phone, country]);
  const phoneValid = parsedPhone.valid;
  const gatewayFor = gateways.data?.route[parsedPhone.country ?? country] ?? null;
  const run = (withSms: boolean) => {
    setSendReal(withSms);
    setDelivery({ state: "idle" });
    firedFor.current = null;
    play();
  };
  useTourAction("sim-run", useCallback(() => run(false), [])); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return hawkers.filter((h) => !s || h.name.toLowerCase().includes(s)).slice(0, 30);
  }, [hawkers, q]);
  const selCentre = hawkers.find((h) => h.id === centreId);

  const areaLayers: MapLayerSpec[] = useMemo(
    () => [
      {
        id: "centres",
        interactive: false,
        points: (r?.results ?? []).map((c) => ({ id: c.id, lon: c.lon, lat: c.lat, props: { name: c.name, paid: settled && c.trace.decision.verdict === "paid", stalls: c.stalls } })),
        halo: { "circle-radius": ["case", ["get", "paid"], 22, 0], "circle-color": MONEY, "circle-opacity": 0.25, "circle-blur": 0.6 },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "stalls"], 10, 6, 200, 12],
          "circle-color": ["case", ["get", "paid"], MONEY, "#16150f"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f4f1e8",
        },
        label: { field: "name", minzoom: 12 },
      },
    ],
    [r, settled]
  );
  const areaFly = useMemo(() => {
    const pts = r?.results ?? [];
    if (!pts.length) return null;
    return { lon: pts.reduce((a, c) => a + c.lon, 0) / pts.length, lat: pts.reduce((a, c) => a + c.lat, 0) / pts.length, zoom: pts.length > 1 ? 12.6 : 13.6 };
  }, [r]);

  return (
    <main className="mx-auto max-w-[1400px] px-5 pb-28 pt-28 md:pt-20">
      <div className="border-b-2 border-ink pb-4">
        <Eyebrow n="04">Scenario lab</Eyebrow>
        <h1 className="sign text-[clamp(2.8rem,6vw,5.6rem)]">Simulate any day, at any stall.</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          Set the readings for a what-if day — a storm at 3pm, a haze week, a heatwave, a gauge going offline — and watch the settlement engine decide,
          minute by minute. The payout message can go to any phone number you enter.
        </p>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[400px_1fr] [&>*]:min-w-0">
        {/* ───────────────── CONTROLS ───────────────── */}
        <aside className="sheet" data-tour="sim-controls">
          <div className="space-y-6 p-5">
            <Block n="A" title="Who is affected">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { id: "centre", label: "One stall" },
                  { id: "area", label: "A whole area" },
                ]}
              />
              {mode === "centre" ? (
                <div className="mt-3">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={selCentre ? selCentre.name : "Search hawker centres…"}
                    className="w-full border-2 border-[var(--rule-2)] bg-paper px-3 py-2 text-[13px] outline-none placeholder:text-ink-2 focus:border-ink"
                  />
                  {q && (
                    <div className="scrollbar-thin mt-1 max-h-44 overflow-y-auto border border-[var(--rule-2)] bg-card" data-lenis-prevent>
                      {filtered.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => {
                            setCentreId(h.id);
                            setQ("");
                          }}
                          className="block w-full border-b border-[var(--rule)] px-3 py-1.5 text-left text-[12.5px] hover:bg-paper-2"
                        >
                          {h.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-3 w-full border-2 border-[var(--rule-2)] bg-paper px-3 py-2 text-[13px] capitalize">
                  {areasWithCentres.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name.toLowerCase()} · {a.n} centre{a.n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              )}
            </Block>

            <Block n="B" title="Start from a scenario">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((x) => (
                  <button key={x.id} onClick={() => applyPreset(x.id)} className={`border px-2.5 py-1 text-[12px] ${preset === x.id ? "border-ink bg-ink text-paper" : "border-[var(--rule-2)] hover:border-ink"}`}>
                    {x.label}
                  </button>
                ))}
              </div>
            </Block>

            <Block n="C" title="The day's readings">
              <div className="space-y-4">
                <Range label="Rain · wettest 60 minutes" value={rain} min={0} max={120} step={1} format={(v) => `${v} mm`} onChange={(v) => { setRain(v); custom(); }} />
                <Range label="Storm peaks at" value={peak} min={9} max={21} step={0.25} format={hhmm} onChange={(v) => { setPeak(v); custom(); }} />
                <Range label="Heat · highest WBGT" value={heat} min={26} max={36} step={0.1} format={(v) => `${v.toFixed(1)} °C`} onChange={(v) => { setHeat(v); custom(); }} />
                <Range label="Haze · 24-hour PSI" value={haze} min={0} max={350} step={1} format={(v) => String(v)} onChange={(v) => { setHaze(v); custom(); }} />
              </div>
            </Block>

            <Block n="D" title="What NEA said the evening before">
              <div className="grid grid-cols-2 gap-1.5">
                {SEV.map((s, i) => (
                  <button key={s} onClick={() => { setSev(i); custom(); }} className={`border px-2 py-1.5 text-left text-[12px] ${sev === i ? "border-ink bg-ink text-paper" : "border-[var(--rule-2)] hover:border-ink"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Range label="Forecast high" value={high} min={28} max={37} step={1} format={(v) => `${v} °C`} onChange={(v) => { setHigh(v); custom(); }} />
              </div>
            </Block>

            <Block n="E" title="This year so far">
              {(["rain", "heat", "haze"] as const).map((k) => (
                <div key={k} className="flex items-center gap-3 py-1">
                  <span className="w-12 text-[12px] capitalize" style={{ color: PERIL_COLOR[k] }}>
                    {k}
                  </span>
                  <span className="flex flex-1 gap-[3px]">
                    {Array.from({ length: P.perils[k].maxDays }).map((_, i) => (
                      <button
                        key={i}
                        aria-label={`${k} days used ${i + 1}`}
                        onClick={() => { setUsed((o) => ({ ...o, [k]: o[k] === i + 1 ? i : i + 1 })); custom(); }}
                        className="h-4 flex-1 border border-ink"
                        style={{ background: i < used[k] ? "var(--ink)" : "transparent" }}
                      />
                    ))}
                  </span>
                  <span className="mono w-10 text-right text-[11px] text-ink-2">
                    {used[k]}/{P.perils[k].maxDays}
                  </span>
                </div>
              ))}
              <div className="mt-3">
                <Toggle checked={outage} onChange={(v) => { setOutage(v); custom(); }} label="Nearest rain gauge is offline today" />
              </div>
            </Block>

            <Block n="F" title="Policy & message">
              <Range label="Insured daily income" value={income} min={50} max={400} step={10} format={(v) => sgd(v)} onChange={setIncome} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {LANGS.map((l) => (
                  <button key={l.id} onClick={() => setLang(l.id)} className={`border px-2.5 py-1 text-[12px] ${lang === l.id ? "border-ink bg-ink text-paper" : "border-[var(--rule-2)] hover:border-ink"}`}>
                    {l.native}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <span className="caps text-ink-3">Send the payout SMS to</span>
                <div className="mt-1 flex border-2 border-ink">
                  <select
                    aria-label="Country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value as Country)}
                    className="mono border-r-2 border-ink bg-paper-2 px-1.5 py-2 text-[13px] outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={COUNTRIES.find((c) => c.id === country)!.example}
                    className="mono w-full min-w-0 bg-card px-2 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="mono mt-1 min-h-[16px] text-[11px]">
                  {phone && !phoneValid ? (
                    <span className="text-alert">{parsedPhone.error}</span>
                  ) : phoneValid ? (
                    <span className="text-plate">✓ {parsedPhone.e164}</span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-start gap-2 border border-[var(--rule-2)] bg-paper-2 px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${gatewayFor ? "bg-plate" : "bg-heat"}`} />
                  {gateways.loading && !gateways.data ? (
                    <span>Checking SMS gateway…</span>
                  ) : gatewayFor ? (
                    <span>
                      Real SMS via <b className="text-ink">{gatewayFor === "fast2sms" ? "Fast2SMS" : "Twilio"}</b> for {country === "IN" ? "Indian" : "Singapore"} numbers.
                    </span>
                  ) : (
                    <span>
                      No SMS gateway set up for {country === "IN" ? "India" : "Singapore"} yet — the message will appear on the on-screen phone only. See README → &ldquo;Sending real SMS&rdquo;.
                    </span>
                  )}
                </div>
              </div>
            </Block>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => run(false)} className="border-2 border-ink bg-card px-3 py-2.5 text-[13px] font-semibold hover:bg-paper-2">
                ▶ Play the day
              </button>
              <button
                onClick={() => run(true)}
                disabled={!phoneValid}
                className="border-2 border-ink bg-ink px-3 py-2.5 text-[13px] font-semibold text-paper shadow-[3px_3px_0_var(--marigold)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Play &amp; send SMS
              </button>
            </div>
          </div>
        </aside>

        {/* ───────────────── STAGE ───────────────── */}
        <section className="space-y-6" data-tour="sim-stage">
          {sim.error && <div className="border-2 border-alert bg-alert-2 px-4 py-2 text-[13px] text-alert">Couldn&apos;t simulate: {sim.error}</div>}
          {/* clock strip */}
          <div className="scope flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <span className="caps text-phosphor">{evening ? "The evening before" : "Trading day"}</span>
            <span className="mono text-[28px] font-semibold tabular-nums text-[#e8f5ec]">{evening ? "18:00" : hhmm(hourNow)}</span>
            <span className="mono text-[12px] text-[#9fc2ad]">
              {mode === "area" ? `${r?.summary.centres ?? "…"} centres in ${area.toLowerCase()}` : centreName} · gauge {trace?.gauges.find((g) => g.used)?.id ?? "…"}
              {outage && trace ? ` (fallback for ${trace.gauges[0]?.id})` : ""}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="h-1.5 w-40 bg-black/40">
                <span className="block h-1.5 bg-phosphor" style={{ width: `${p * 100}%` }} />
              </span>
              <button onClick={() => run(false)} className="mono border border-phosphor px-2 py-0.5 text-[11px] text-phosphor hover:bg-phosphor/10">
                {playing ? "replay" : "▶ play"}
              </button>
            </span>
          </div>

          {/* instruments + phone */}
          <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
            <div className="sheet grid md:grid-cols-[1.1fr_1fr]">
              <div className="relative h-[420px] border-b border-[var(--rule-2)] md:border-b-0 md:border-r">
                <div className="absolute inset-x-0 top-0 z-10 flex items-baseline justify-between border-b border-[var(--rule-2)] bg-card/90 px-4 py-2">
                  <span className="caps whitespace-nowrap text-ink">Rain gauge · wettest hour</span>
                  <span className="mono text-[22px] font-semibold leading-none tabular-nums text-rain">
                    {wettestSoFar.toFixed(1)}
                    <span className="ml-1 text-[12px]">mm</span>
                  </span>
                </div>
                <RainGauge3D
                  className="h-full w-full pt-10"
                  value={wettestSoFar}
                  max={Math.max(100, rain * 1.1)}
                  raining={rainingNow}
                  levels={P.perils.rain.tiers.map((t, i) => ({ mm: t.threshold, label: `L${i + 1} ${t.threshold}mm → ${sgd(t.payoutPct * income)}`, reached: wettestSoFar >= t.threshold }))}
                />
              </div>
              <div className="flex flex-col justify-around gap-4 p-5">
                <Dial value={wbgtNow} min={26} max={36} decimals={1} color={PERIL_COLOR.heat} label="Heat · highest WBGT today" unit="°C" levels={P.perils.heat.tiers.map((t) => ({ v: t.threshold, label: `${t.threshold}°C` }))} />
                <Dial value={evening ? haze : haze} min={0} max={350} color={PERIL_COLOR.haze} label="Haze · 24-h PSI" unit="PSI" levels={P.perils.haze.tiers.map((t) => ({ v: t.threshold, label: String(t.threshold) }))} />
              </div>
            </div>

            <PhoneThread
              messages={[
                ...(advanceShown ? [{ id: "adv", time: "18:00 · day before", text: advText, kind: "advance" as const }] : []),
                ...(settled && trace ? [{ id: "pay", time: hhmm(settleHour), text: payoutText, kind: trace.decision.verdict === "paid" ? ("paid" as const) : ("none" as const) }] : []),
              ]}
              delivery={delivery}
              phone={phone}
            />
          </div>

          {/* timeline */}
          <div className="sheet p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="caps text-ink">Fig. — the simulated day, minute by minute</span>
              <span className="caps text-ink-3">bars = 5-min rain · line = rolling hour · dashed = payout levels</span>
            </div>
            <Timeline day={day} p={p} evening={evening} hourNow={hourNow} settleHour={settleHour} trace={trace ?? null} advance={!!trace?.prepPay.sent} />
          </div>

          {/* outcome */}
          <div className="grid items-start gap-6 xl:grid-cols-[1fr_400px]">
            <div className="space-y-6">
              <Outcome r={r} trace={trace ?? null} settled={settled || !playing} mode={mode} area={area} />
              {mode === "area" && (
                <figure className="sheet">
                  <div className="caps border-b border-[var(--rule-2)] px-4 py-2 text-ink">Fig. — hawker centres in {area.toLowerCase()}</div>
                  <div className="relative h-[360px]">
                    <MapView className="absolute inset-0" layers={areaLayers} pitch={0} fly={areaFly} />
                  </div>
                </figure>
              )}
              <Why>
                The simulator calls the same settlement function as real days (levels → one peril pays → caps → Prep Pay netting), so a what-if can never
                disagree with a real settlement. Only the within-day shape of the storm is illustrative; the payout depends on the readings alone.
              </Why>
            </div>
            <div>{trace ? <Receipt key={`${trace.decision.headline}-${trace.perils.map((x) => x.value).join()}`} t={trace} title={first?.name} /> : <ReceiptSkeleton />}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 border-b border-[var(--rule-2)] pb-1.5">
        <span className="plate !px-1.5 !py-0.5 !text-[10px]">{n}</span>
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Outcome({ r, trace, settled, mode, area }: { r: SimResult | null; trace: DecisionTrace | null; settled: boolean; mode: string; area: string }) {
  if (!r || !trace) return <div className="sheet skeleton h-40" />;
  const d = trace.decision;
  const takeUp = 0.3;
  const policies = Math.round(r.summary.stalls * takeUp);
  return (
    <div className="sheet grid md:grid-cols-3">
      <div className="border-b border-[var(--rule-2)] p-5 md:border-b-0 md:border-r">
        <div className="caps text-ink-3">Engine verdict</div>
        <div className="sign mt-1 text-[44px]" style={{ color: d.verdict === "paid" ? MONEY : d.verdict === "capped" ? "#d2480f" : "var(--ink-3)" }}>
          {d.verdict === "paid" ? sgd(d.transfer, Number.isInteger(d.transfer) ? 0 : 2) : d.verdict === "capped" ? "Capped" : "S$0"}
        </div>
        <div className="text-[12.5px] text-ink-2">{d.headline}</div>
      </div>
      <div className="border-b border-[var(--rule-2)] p-5 md:border-b-0 md:border-r">
        <div className="caps text-ink-3">Stallholder&apos;s day</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="mono text-[18px] font-semibold text-alert">{sgd(r.summary.likelyLoss)}</div>
            <div className="text-[11px] text-ink-3">likely lost takings</div>
          </div>
          <div>
            <div className="mono text-[18px] font-semibold" style={{ color: MONEY }}>
              {sgd(d.gross)}
            </div>
            <div className="text-[11px] text-ink-3">covered{trace.prepPay.sent ? ` · ${sgd(trace.prepPay.amount)} early` : ""}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-ink-3">Payouts stay below the likely loss: insurance, not a bet.</div>
      </div>
      <div className="p-5">
        <div className="caps text-ink-3">{mode === "area" ? `Across ${area.toLowerCase()}` : "For Income"}</div>
        <AnimatePresence mode="wait">
          <motion.div key={`${settled}-${r.summary.paidCentres}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mono mt-1 text-[15px] font-semibold">
              {r.summary.centres} centre{r.summary.centres > 1 ? "s" : ""}
              <span className="text-ink-3"> · </span>
              {r.summary.stalls.toLocaleString()} stalls
            </div>
            <div className="text-[12.5px] text-ink-2">
              at 30% take-up ≈ {policies.toLocaleString()} policies →{" "}
              <b className="mono" style={{ color: MONEY }}>
                {sgd(policies * (d.verdict === "paid" ? d.gross : 0))}
              </b>{" "}
              paid {d.verdict === "paid" ? "automatically, no claims" : ""}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function PhoneThread({
  messages,
  delivery,
  phone,
}: {
  messages: { id: string; time: string; text: string; kind: "advance" | "paid" | "none" }[];
  delivery: { state: string; detail?: string };
  phone: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="rounded-[38px] border-2 border-ink bg-[#16150f] p-2.5 shadow-[6px_6px_0_var(--marigold)]">
        <div className="relative h-[470px] overflow-hidden rounded-[30px] bg-[#f4f1e8]">
          <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#16150f]" />
          <div className="border-b border-[var(--rule-2)] px-4 pb-2 pt-9 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-plate text-[11px] font-bold text-white">IN</div>
            <div className="mt-1 text-[12px] font-semibold">INCOME · Canopy</div>
            <div className="mono text-[10px] text-ink-3">{phone ? `to ${phone}` : "SMS"}</div>
          </div>
          <div className="space-y-3 p-3">
            <AnimatePresence>
              {messages.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
                  <div className="mono mb-1 text-center text-[9.5px] text-ink-3">{m.time}</div>
                  <div
                    className="max-w-[92%] rounded-[16px] rounded-bl-[4px] border px-3 py-2 text-[12px] leading-snug"
                    style={{
                      background: m.kind === "paid" ? "#fbf0d0" : m.kind === "advance" ? "#e3efe8" : "#fbf9f3",
                      borderColor: m.kind === "paid" ? "#e9a100" : m.kind === "advance" ? "#0b6e4f" : "rgba(22,21,15,0.24)",
                    }}
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {!messages.length && <div className="mono pt-24 text-center text-[11px] text-ink-3">press play to run the day</div>}
          </div>
        </div>
      </div>
      {delivery.state !== "idle" && (
        <div
          className={`mono mt-3 border-2 px-3 py-2 text-[11px] ${delivery.state === "sent" ? "border-plate bg-plate-2 text-plate" : delivery.state === "failed" ? "border-alert bg-alert-2 text-alert" : "border-ink bg-card text-ink-2"}`}
        >
          {delivery.state === "sending" ? "Sending SMS…" : delivery.state === "sent" ? `✓ SMS sent · ${delivery.detail}` : delivery.state === "simulated" ? `On-screen only · ${delivery.detail}` : `✕ Not sent · ${delivery.detail}`}
        </div>
      )}
    </div>
  );
}

function Timeline({
  day,
  p,
  evening,
  hourNow,
  settleHour,
  trace,
  advance,
}: {
  day: ReturnType<typeof buildDay>;
  p: number;
  evening: boolean;
  hourNow: number;
  settleHour: number;
  trace: DecisionTrace | null;
  advance: boolean;
}) {
  const W = 900;
  const H = 190;
  const L = 70; // evening column width
  const top = 18;
  const base = H - 28;
  const x = (h: number) => L + ((h - DAY_START) / (DAY_END - DAY_START)) * (W - L - 10);
  const maxY = Math.max(80, ...day.hour) * 1.1;
  const y = (v: number) => base - (v / maxY) * (base - top);
  const maxBar = Math.max(1, ...day.rain);
  const linePts = day.t.map((h, i) => `${x(h)},${y(day.hour[i])}`).join(" ");
  const playX = evening ? (p / 0.12) * (L - 8) + 4 : x(hourNow);
  const rainTiers = P.perils.rain.tiers;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* evening column */}
      <rect x={0} y={top - 8} width={L - 8} height={base - top + 8} fill="#e3efe8" />
      <text x={(L - 8) / 2} y={top + 6} textAnchor="middle" fontSize="9" fontFamily="var(--font-plex-mono)" fill="#0b6e4f">
        18:00
      </text>
      <text x={(L - 8) / 2} y={top + 18} textAnchor="middle" fontSize="8.5" fontFamily="var(--font-plex-mono)" fill="#0b6e4f">
        forecast
      </text>
      {advance && (
        <g>
          <rect x={(L - 8) / 2 - 22} y={base - 30} width={44} height={18} fill="#0b6e4f" />
          <text x={(L - 8) / 2} y={base - 18} textAnchor="middle" fontSize="9" fill="#fff" fontFamily="var(--font-plex-mono)">
            advance
          </text>
        </g>
      )}
      {/* hour grid */}
      {Array.from({ length: DAY_END - DAY_START + 1 }).map((_, i) => (
        <g key={i}>
          <line x1={x(DAY_START + i)} x2={x(DAY_START + i)} y1={top} y2={base} stroke="rgba(22,21,15,0.08)" />
          {i % 2 === 0 && (
            <text x={x(DAY_START + i)} y={base + 14} textAnchor="middle" fontSize="9" fontFamily="var(--font-plex-mono)" fill="#868170">
              {String(DAY_START + i).padStart(2, "0")}:00
            </text>
          )}
        </g>
      ))}
      {/* level lines */}
      {rainTiers.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - 10} y1={y(t.threshold)} y2={y(t.threshold)} stroke="#16150f" strokeDasharray="5 4" />
          <text x={W - 12} y={y(t.threshold) - 4} textAnchor="end" fontSize="9" fontFamily="var(--font-plex-mono)" fill="#16150f">
            L{i + 1} {t.threshold} mm
          </text>
        </g>
      ))}
      {/* bars (5-min rain) */}
      {day.t.map((h, i) =>
        day.rain[i] > 0.05 ? (
          <rect key={i} x={x(h) - 1.6} width={3.2} y={base - (day.rain[i] / maxBar) * (base - top) * 0.45} height={(day.rain[i] / maxBar) * (base - top) * 0.45} fill="#b9c9e8" opacity={!evening && h <= hourNow ? 1 : 0.35} />
        ) : null
      )}
      {/* rolling hour line, revealed up to the playhead */}
      <defs>
        <clipPath id="sofar">
          <rect x={0} y={0} width={evening ? L : Math.max(L, playX)} height={H} />
        </clipPath>
      </defs>
      <polyline points={linePts} fill="none" stroke="#c9d6ef" strokeWidth="1.5" />
      <polyline points={linePts} fill="none" stroke="#1d5fd1" strokeWidth="2.4" clipPath="url(#sofar)" />
      {/* level crossings */}
      {day.crossRain.map((h, i) =>
        h !== null ? (
          <g key={i} opacity={!evening && hourNow >= h ? 1 : 0.25}>
            <circle cx={x(h)} cy={y(rainTiers[i].threshold)} r={5} fill="#e9a100" stroke="#16150f" />
            <text x={x(h) + 7} y={y(rainTiers[i].threshold) + 12} fontSize="9" fontFamily="var(--font-plex-mono)" fill="#16150f">
              L{i + 1} @ {hhmm(h)}
            </text>
          </g>
        ) : null
      )}
      {/* settlement */}
      {trace && (
        <g opacity={!evening && hourNow >= settleHour ? 1 : 0.25}>
          <line x1={x(settleHour)} x2={x(settleHour)} y1={top} y2={base} stroke="#e9a100" strokeWidth="2" />
          <rect x={x(settleHour) - 38} y={top - 16} width={76} height={15} fill={trace.decision.verdict === "paid" ? "#e9a100" : "#16150f"} />
          <text x={x(settleHour)} y={top - 5} textAnchor="middle" fontSize="9" fill={trace.decision.verdict === "paid" ? "#16150f" : "#f4f1e8"} fontFamily="var(--font-plex-mono)">
            {trace.decision.verdict === "paid" ? `PAID ${hhmm(settleHour)}` : "day closes"}
          </text>
        </g>
      )}
      {/* playhead */}
      <motion.line x1={playX} x2={playX} y1={top - 8} y2={base + 4} stroke="#16150f" strokeWidth="1.5" />
      <motion.circle cx={playX} cy={base + 4} r={4} fill="#16150f" />
      <line x1={L} x2={W - 10} y1={base} y2={base} stroke="#16150f" />
    </svg>
  );
}
