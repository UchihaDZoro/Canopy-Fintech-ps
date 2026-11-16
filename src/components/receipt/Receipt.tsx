"use client";
import { motion } from "motion/react";
import type { DecisionTrace } from "@/lib/client/types";
import { PERIL_COLOR, PERIL_LABEL } from "@/components/ui";

const money = (v: number) => `S$${v.toFixed(2)}`;

/** Thermal-receipt rendering of one payout decision. Every line is a step the engine took. */
export function Receipt({ t, title, compact = false }: { t: DecisionTrace; title?: string; compact?: boolean }) {
  const paid = t.decision.verdict === "paid";
  const nice = t.mode === "simulation" ? "Simulated day" : new Date(t.date + "T00:00:00").toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  let step = 0;
  const S = () => String(++step).padStart(2, "0");
  return (
    <motion.div
      initial={{ y: -24, opacity: 0, clipPath: "inset(0 0 100% 0)" }}
      animate={{ y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)" }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      className="receipt relative w-full px-5 pb-8 pt-5 text-[11.5px] leading-[1.55]"
    >
      {/* header */}
      <div className="text-center">
        <div className="text-[13px] font-semibold tracking-[0.2em]">DAYCOVER+ · INCOME</div>
        <div className="text-[10px] text-[#6b675a]">Parametric settlement record</div>
        <div className="mx-auto mt-2 max-w-[78%] font-semibold">{title ?? t.location.label ?? `${t.location.lat.toFixed(4)}, ${t.location.lon.toFixed(4)}`}</div>
        <div className="text-[10px] text-[#6b675a]">
          {nice} · {t.mode === "live" ? "LIVE · 5-min data" : t.mode === "simulation" ? "SCENARIO · what-if" : "OFFICIAL RECORD"} · {t.region.toUpperCase()} region
        </div>
      </div>

      <Stamp verdict={t.decision.verdict} amount={t.decision.transfer} />

      {/* 1. location → gauge */}
      <Section n={S()} title="Which instruments count">
        {t.gauges.map((g) => (
          <div key={g.id} className="flex items-center gap-2">
            <span className={g.used ? "font-semibold" : g.online ? "" : "text-[#9a9585] line-through"}>
              {g.used ? "▸" : " "} {g.id}
            </span>
            <span className="truncate text-[#6b675a]">{g.name}</span>
            <span className="relative ml-auto h-[5px] w-16 bg-[#ece7d8]">
              <span className="absolute inset-y-0 left-0 bg-[#16150f]" style={{ width: `${Math.min(100, (g.km / 5) * 100)}%`, opacity: g.used ? 1 : 0.35 }} />
            </span>
            <span className="w-12 text-right tabular-nums">{g.km.toFixed(2)}km</span>
          </div>
        ))}
        <div className="mt-1 text-[10px] text-[#6b675a]">
          Nearest gauge that reported is used; offline gauges are skipped automatically.
          {t.wbgtStation ? ` Heat: ${t.wbgtStation.name} (${t.wbgtStation.km}km).` : ""} Haze: {t.region} PSI.
        </div>
      </Section>

      {/* 2. readings vs levels */}
      <Section n={S()} title="Readings against the printed levels">
        <div className="space-y-2.5">
          {t.perils.map((p) => (
            <Ladder key={p.peril} p={p} />
          ))}
        </div>
      </Section>

      {t.rainWindow && t.rainWindow.series.length > 0 && !compact && (
        <Section n={S()} title="Wettest 60 minutes today (5-min gauge data)">
          <RainWindow w={t.rainWindow} />
        </Section>
      )}

      {/* caps */}
      <Section n={S()} title="Caps used this year before today">
        <div className="space-y-1">
          {(["rain", "heat", "haze"] as const).map((p) => (
            <CapRow key={p} label={p} used={t.caps.usedBefore[p]} max={t.caps.perilMax[p]} />
          ))}
          <CapRow label="all perils" used={t.caps.totalBefore} max={t.caps.totalMax} strong />
        </div>
        {t.caps.blocked && <div className="mt-1 font-semibold text-[#c0262d]">Cap reached — trigger recorded but not payable.</div>}
      </Section>

      {/* prep pay */}
      {t.prepPay.enabled && (
        <Section n={S()} title="Prep Pay (forecast the evening before)">
          {t.prepPay.forecast ? (
            <>
              <Row k="NEA said for this region" v={`“${t.prepPay.forecast.regionText || t.prepPay.forecast.general}”`} />
              {t.prepPay.forecast.high !== null && <Row k="Forecast high" v={`${t.prepPay.forecast.high}°C`} />}
              <Row k="Rule" v={t.prepPay.rule.replace(/^Send /, "")} />
              <Row k="Advance sent" v={t.prepPay.sent ? money(t.prepPay.amount) : "no"} bold={t.prepPay.sent} />
              <div className="text-[10px] text-[#6b675a]">Source: {t.prepPay.forecast.source}</div>
            </>
          ) : (
            <div className="text-[#6b675a]">No archived evening forecast for this date.</div>
          )}
        </Section>
      )}

      {/* total */}
      <div className="dotted-rule mt-3 pt-2">
        <Row k="Highest level reached" v={t.decision.peril ? `${t.decision.peril} · level ${t.decision.tier}` : "none"} />
        <Row k="Payout due" v={money(t.decision.gross)} />
        {t.decision.advanceDeducted > 0 && <Row k="Less advance paid last night" v={`− ${money(t.decision.advanceDeducted)}`} />}
        <div className="mt-1 flex items-baseline justify-between border-t-2 border-[#1b1a14] pt-1.5 text-[14px] font-semibold">
          <span>PAYNOW TRANSFER</span>
          <span className={paid ? "" : "text-[#9a9585]"}>{money(t.decision.transfer)}</span>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 space-y-0.5 text-[10.5px] text-[#4a473d]">
          {t.decision.reasons.map((r, i) => (
            <div key={i}>· {r}</div>
          ))}
        </div>
      )}
      <div className="mt-4 text-center text-[9.5px] tracking-wide text-[#6b675a]">
        No claim form · settled on public NEA/MSS data · insured by Income
        <div className="mt-1 tracking-[0.3em]">▌▌▍▌▍▍▌▌▍▌▌▍▍▌▍▌▌▍</div>
      </div>
    </motion.div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="dotted-rule mt-3 pt-2">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
        <span className="bg-[#1b1a14] px-1 text-[#fffdf7]">{n}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#4a473d]">{k}</span>
      <span className={`text-right ${bold ? "font-semibold" : ""}`}>{v}</span>
    </div>
  );
}

/** Reading vs tier ladder: a mini scale with the value marker */
function Ladder({ p }: { p: DecisionTrace["perils"][number] }) {
  const color = PERIL_COLOR[p.peril];
  const top = p.tiers.at(-1)?.threshold ?? 1;
  const base = p.peril === "heat" ? 26 : 0;
  const maxV = Math.max(top * 1.3, (p.value ?? 0) * 1.05, base + 1);
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - base) / (maxV - base)) * 100))}%`;
  if (!p.enabled)
    return (
      <div className="text-[#9a9585]">
        {PERIL_LABEL[p.peril]}: not covered
      </div>
    );
  return (
    <div>
      <div className="flex justify-between">
        <span style={{ color }} className="font-semibold">
          {PERIL_LABEL[p.peril]}
        </span>
        <span>
          {p.value === null ? "no reading" : `${p.value} ${p.unit}`}
          {p.probability !== null && p.probability !== undefined ? ` · ${(p.probability * 100).toFixed(0)}% likely` : ""}
        </span>
      </div>
      <div className="relative mb-4 mt-3.5 h-[14px]">
        <div className="absolute inset-x-0 top-[5px] h-[4px] bg-[#ece7d8]" />
        {p.value !== null && (
          <motion.div
            className="absolute top-[5px] h-[4px]"
            style={{ background: color, left: 0 }}
            initial={{ width: 0 }}
            animate={{ width: x(p.value) }}
            transition={{ duration: 0.9, delay: 0.3 }}
          />
        )}
        {p.tiers.map((t, i) => (
          <div key={i} className="absolute top-0 h-[14px] w-px bg-[#1b1a14]" style={{ left: x(t.threshold) }}>
            <span className={`absolute left-1 whitespace-nowrap bg-[#fffdf7] px-0.5 text-[8.5px] text-[#4a473d] ${i % 2 ? "top-[13px]" : "-top-[11px]"}`}>
              L{i + 1} {t.threshold}→S${t.amount}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 text-[9.5px] text-[#6b675a]">{p.source}</div>
    </div>
  );
}

function RainWindow({ w }: { w: NonNullable<DecisionTrace["rainWindow"]> }) {
  const W = 260;
  const H = 46;
  const t0 = w.series[0][0];
  const t1 = w.series.at(-1)![0];
  const maxV = Math.max(1, ...w.series.map((p) => p[1]));
  const span = Math.max(1, t1 - t0);
  const bw = Math.max(1, (W / Math.max(1, w.series.length)) * 0.8);
  const hh = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(11, 16);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full">
        {w.start && w.end && w.max60 > 0 && (
          <rect x={((w.start - t0) / span) * W} width={Math.max(4, ((w.end - w.start) / span) * W)} y={0} height={H} fill="#e2ebfa" />
        )}
        {w.series.map(([t, v], i) => (
          <rect key={i} x={((t - t0) / span) * W} width={bw} y={H - (v / maxV) * H} height={(v / maxV) * H} fill="#1d5fd1" />
        ))}
        <line x1={0} x2={W} y1={H} y2={H} stroke="#1b1a14" />
        <text x={0} y={H + 10} fontSize="8" fill="#6b675a">{hh(t0)}</text>
        <text x={W} y={H + 10} fontSize="8" fill="#6b675a" textAnchor="end">{hh(t1)}</text>
      </svg>
      <div className="flex justify-between text-[10px]">
        <span className="text-[#4a473d]">Shaded = wettest rolling hour</span>
        <span>
          {w.max60} mm {w.max60 >= w.threshold ? "≥" : "<"} {w.threshold} mm
        </span>
      </div>
    </div>
  );
}

function CapRow({ label, used, max, strong }: { label: string; used: number; max: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-16 ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span className="flex flex-1 gap-[2px]">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className="h-[7px] flex-1" style={{ background: i < Math.floor(used) ? "#1b1a14" : i < used ? "#8a8576" : "#ece7d8" }} />
        ))}
      </span>
      <span className="w-14 text-right tabular-nums">
        {(Math.floor(used * 10) / 10).toFixed(1)}/{max}
      </span>
    </div>
  );
}

function Stamp({ verdict, amount }: { verdict: DecisionTrace["decision"]["verdict"]; amount: number }) {
  const map = {
    paid: { text: "PAID", sub: `S$${amount.toFixed(2)}`, color: "#0b6e4f" },
    "not-paid": { text: "NOT PAID", sub: "below levels", color: "#c0262d" },
    capped: { text: "CAPPED", sub: "limit used", color: "#d2480f" },
  }[verdict];
  return (
    <motion.div
      initial={{ scale: 2.2, opacity: 0, rotate: -24 }}
      animate={{ scale: 1, opacity: 0.9, rotate: -11 }}
      transition={{ delay: 0.8, type: "spring", stiffness: 260, damping: 14 }}
      className="pointer-events-none absolute right-3 top-3 flex flex-col items-center border-[3px] px-2 py-0.5"
      style={{ borderColor: map.color, color: map.color, mixBlendMode: "multiply" }}
    >
      <span className="text-[14px] font-bold tracking-[0.12em]">{map.text}</span>
      <span className="text-[9px] font-semibold tracking-widest">{map.sub}</span>
    </motion.div>
  );
}

export function ReceiptSkeleton() {
  return <div className="receipt h-[520px] w-full skeleton opacity-60" />;
}
