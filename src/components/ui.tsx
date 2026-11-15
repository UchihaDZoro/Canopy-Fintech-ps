"use client";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/* One colour = one meaning, everywhere */
export const PERIL_COLOR = { rain: "#1d5fd1", heat: "#d2480f", haze: "#6f52a3" } as const;
export const PERIL_TINT = { rain: "#e2ebfa", heat: "#f9e6dc", haze: "#ece6f5" } as const;
export const PERIL_LABEL = { rain: "Heavy rain", heat: "Heat stress", haze: "Haze" } as const;
export const PERIL_INDEX = { rain: "wettest 60 min (mm)", heat: "WBGT (°C)", haze: "24-h PSI" } as const;
export const MONEY = "#e9a100";
export const LOST = "#c0262d";
export const COVER = "#0b6e4f";

export function Logo({ className = "" }: { className?: string }) {
  // A hawker-centre canopy roof over a rain gauge
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#0b6e4f" />
      <path d="M5 15 L16 7 L27 15 Z" fill="#f4f1e8" />
      <path d="M5 15 h22" stroke="#16150f" strokeWidth="1.4" />
      <rect x="13" y="17" width="6" height="9" rx="1" fill="none" stroke="#f4f1e8" strokeWidth="1.6" />
      <rect x="14.6" y="21" width="2.8" height="4" fill="#e9a100" />
    </svg>
  );
}

export function Reveal({ children, delay = 0, y = 18, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Counter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.4,
  className = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toLocaleString("en-SG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, duration, mv]);
  return <motion.span ref={ref} className={`mono tabular-nums ${className}`}>{text}</motion.span>;
}

/** Stall number plate — step / section label */
export function Plate({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`plate ${className}`}>{children}</span>;
}

/** Section kicker: plate + caps line */
export function Eyebrow({ children, n, color }: { children: ReactNode; n?: string; color?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {n && <Plate>#{n}</Plate>}
      <span className="caps text-ink-2" style={color ? { color } : undefined}>{children}</span>
      <span className="h-px flex-1 bg-[var(--rule-2)]" />
    </div>
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`sheet ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Scope({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`scope ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Stat({ label, children, hint, accent = "" }: { label: string; children: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="caps text-ink-3">{label}</div>
      <div className={`mono text-2xl font-semibold tracking-tight ${accent}`}>{children}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Pill({ children, color = "#0b6e4f" }: { children: ReactNode; color?: string }) {
  return (
    <span className="mono inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium" style={{ background: `${color}18`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}>
      {children}
    </span>
  );
}

/** "Why" callout used everywhere a judge might ask "what does this mean?" */
export function Why({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex gap-2.5 border-l-[3px] border-marigold bg-marigold-2/60 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2 ${className}`}>
      <span className="caps mt-[3px] shrink-0 text-ink">Why</span>
      <span>{children}</span>
    </div>
  );
}

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className="mono font-medium tabular-nums text-ink">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--p" as string]: `${p}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5 text-[12.5px] text-ink-2 hover:text-ink">
      <span className={`relative h-[18px] w-8 border border-ink transition-colors ${checked ? "bg-plate" : "bg-paper-2"}`}>
        <motion.span className="absolute top-[2px] h-3 w-3 border border-ink bg-card" animate={{ left: checked ? 15 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 32 }} />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex border border-ink">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`px-3 py-1.5 text-[12px] ${value === o.id ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const sgd = (v: number, dp = 0) => `S$${v.toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
