"use client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { LiveResponse, WireFeed } from "@/lib/client/types";
import { Flash } from "./Freshness";

const ORDER = ["rain", "wbgt", "psi", "fc24", "nowcast"];
const USE: Record<string, string> = {
  rain: "→ rain trigger (wettest hour per gauge)",
  wbgt: "→ heat trigger (max WBGT today)",
  psi: "→ haze trigger (24-h PSI by region)",
  fc24: "→ Prep Pay decision for tomorrow",
  nowcast: "→ context only (not a trigger)",
};

function ago(ms: number | null, now: number) {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return n;
}

function Led({ f }: { f?: WireFeed }) {
  const c = !f ? "#c0262d" : f.error ? "#e9a100" : f.servedFrom === "network" || f.servedFrom === "cache" ? "#8cf5b5" : "#e9a100";
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />;
}

export function DataWire({ live, compact = false }: { live: LiveResponse | null; compact?: boolean }) {
  const now = useNow();
  const feeds = ORDER.map((k) => live?.wire.feeds.find((f) => f.feed === k)).filter(Boolean) as WireFeed[];
  const s = live?.summary;
  return (
    <div className="scope scope-grid relative overflow-hidden" data-tour="wire">
      <div className="flex items-center justify-between border-b border-[var(--scope-line)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-phosphor blink" />
          <span className="caps text-phosphor">The data wire</span>
          <span className="caps text-phosphor-dim">· what the engine fetched</span>
        </div>
        <span className="caps text-phosphor-dim">source: api-open.data.gov.sg · NEA / MSS</span>
      </div>

      <div className={`grid gap-0 ${compact ? "" : "lg:grid-cols-[1.25fr_1fr]"}`}>
        {/* feeds */}
        <div className="divide-y divide-[var(--scope-line)]">
          {(feeds.length ? feeds : ORDER.map((k) => ({ feed: k }) as WireFeed)).map((f) => (
            <div key={f.feed} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Led f={f.label ? f : undefined} />
                <span className="text-[13px] font-semibold text-[#e8f5ec]">{f.label ?? "connecting…"}</span>
                <span className="mono ml-auto text-[10.5px] text-phosphor-dim">{f.fetchedAt ? ago(f.fetchedAt, now) : ""}</span>
              </div>
              {f.label && (
                <>
                  <div className="mono mt-1 truncate text-[10.5px] text-phosphor/80">GET {f.endpoint}</div>
                  <div className="mono mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-[#9fc2ad]">
                    <span>{f.requests} req</span>
                    <span>{f.ms} ms</span>
                    <span>{(f.bytes / 1024).toFixed(1)} KB</span>
                    <span className="text-phosphor">
                      <Flash value={f.records}>
                        {f.records} {f.unit}
                      </Flash>
                    </span>
                    <span className={f.servedFrom === "network" ? "text-phosphor" : "text-[#e9c46a]"}>{f.servedFrom}</span>
                  </div>
                  {!compact && (
                    <div className="mono mt-1.5 overflow-hidden whitespace-nowrap rounded-sm bg-black/40 px-2 py-1 text-[10px] text-[#c9e7d4]">
                      <Typed text={f.sample} />
                    </div>
                  )}
                  <div className="mt-1 text-[10.5px] text-[#7fa58e]">{USE[f.feed]}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* flow */}
        {!compact && (
          <div className="relative border-t border-[var(--scope-line)] p-4 lg:border-l lg:border-t-0">
            <Flow live={live} />
            <div className="mono mt-3 grid grid-cols-3 gap-2 text-center">
              <Out label="paid today" v={s?.paid ?? 0} c="#e9a100" />
              <Out label="on watch" v={s?.watch ?? 0} c="#ff8a50" />
              <Out label="prep pay tonight" v={s?.prepPay ?? 0} c="#8cf5b5" />
            </div>
          </div>
        )}
      </div>

      {/* log */}
      <div className="border-t border-[var(--scope-line)] bg-black/30 px-4 py-2">
        <div className="caps mb-1 text-phosphor-dim">request log</div>
        <div className="mono h-[84px] space-y-0.5 overflow-hidden text-[10.5px]">
          {(live?.wire.log ?? []).slice(0, 6).map((e, i) => (
            <motion.div key={`${e.at}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1 - i * 0.12, x: 0 }} className="flex gap-3 text-[#9fc2ad]">
              <span className="text-phosphor-dim">{new Date(e.at).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour12: false })}</span>
              <span className={e.status === "ok" ? "text-phosphor" : "text-[#e9c46a]"}>{e.status === "ok" ? "200" : e.status === "rate-limited" ? "429" : "ERR"}</span>
              <span className="truncate">{e.endpoint}</span>
              <span className="ml-auto shrink-0">{e.ms}ms</span>
            </motion.div>
          ))}
          {!live && <div className="text-phosphor-dim">connecting to data.gov.sg<span className="blink">_</span></div>}
        </div>
      </div>
    </div>
  );
}

function Out({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="border border-[var(--scope-line)] bg-black/20 py-2">
      <div className="text-xl font-semibold" style={{ color: c }}>
        <Flash value={v}>{v}</Flash>
      </div>
      <div className="text-[9.5px] uppercase tracking-wider text-[#7fa58e]">{label}</div>
    </div>
  );
}

function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const i = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(i), k) : k + 3)), 18);
    return () => clearInterval(i);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      <span className="blink">▍</span>
    </span>
  );
}

/** Feeds → trigger engine → centres, with packets flowing along the wires */
function Flow({ live }: { live: LiveResponse | null }) {
  const W = 400;
  const H = 230;
  const inputs = [
    { k: "rain", y: 30, label: `${live?.wire.feeds.find((f) => f.feed === "rain")?.records ?? "…"} gauges` },
    { k: "wbgt", y: 82, label: `${live?.wire.feeds.find((f) => f.feed === "wbgt")?.records ?? "…"} WBGT` },
    { k: "psi", y: 134, label: "5 PSI regions" },
    { k: "fc24", y: 186, label: "forecast" },
  ];
  const ex = 160;
  const ey = 108;
  const outs = [
    { y: 50, label: `${live?.centres.length ?? "…"} centres matched` },
    { y: 108, label: "levels · caps" },
    { y: 166, label: "PayNow + SMS" },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {inputs.map((n, i) => {
        const d = `M 80 ${n.y} C 120 ${n.y}, 120 ${ey}, ${ex} ${ey}`;
        return (
          <g key={n.k}>
            <path d={d} fill="none" stroke="rgba(140,245,181,0.25)" strokeWidth="1.2" />
            <path d={d} fill="none" stroke="#8cf5b5" strokeWidth="1.6" strokeDasharray="3 14" filter="url(#glow)">
              <animate attributeName="stroke-dashoffset" from="34" to="0" dur={`${1.2 + i * 0.25}s`} repeatCount="indefinite" />
            </path>
            <rect x={2} y={n.y - 11} width={78} height={22} fill="#0b120e" stroke="rgba(140,245,181,0.35)" />
            <text x={41} y={n.y + 3.5} fontSize="8.5" textAnchor="middle" fill="#cfeedd" fontFamily="var(--font-plex-mono)">
              {n.label}
            </text>
          </g>
        );
      })}
      <rect x={ex} y={ey - 34} width={88} height={68} fill="#0b120e" stroke="#8cf5b5" />
      <text x={ex + 44} y={ey - 14} fontSize="9.5" textAnchor="middle" fill="#8cf5b5" fontFamily="var(--font-plex-mono)">
        TRIGGER
      </text>
      <text x={ex + 44} y={ey} fontSize="9.5" textAnchor="middle" fill="#8cf5b5" fontFamily="var(--font-plex-mono)">
        ENGINE
      </text>
      <text x={ex + 44} y={ey + 16} fontSize="8" textAnchor="middle" fill="#7fa58e" fontFamily="var(--font-plex-mono)">
        rules = spec
      </text>
      {outs.map((o, i) => {
        const d = `M ${ex + 88} ${ey} C ${ex + 118} ${ey}, ${ex + 118} ${o.y}, ${W - 112} ${o.y}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="rgba(233,161,0,0.3)" strokeWidth="1.2" />
            <path d={d} fill="none" stroke="#e9a100" strokeWidth="1.6" strokeDasharray="3 14">
              <animate attributeName="stroke-dashoffset" from="34" to="0" dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite" />
            </path>
            <rect x={W - 112} y={o.y - 11} width={110} height={22} fill="#0b120e" stroke="rgba(233,161,0,0.45)" />
            <text x={W - 57} y={o.y + 3.5} fontSize="8" textAnchor="middle" fill="#f5d98a" fontFamily="var(--font-plex-mono)">
              {o.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
