"use client";
import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

/**
 * Semicircular instrument dial with printed payout levels.
 * The needle tip is computed from the value (polar → x,y) and spring-animated, instead of
 * rotating an SVG group — CSS transform-origin on SVG resolves against the element's own
 * bounding box, which made the needle swing around the wrong point.
 */
export function Dial({
  value,
  min,
  max,
  levels,
  color,
  label,
  unit,
  decimals = 0,
}: {
  value: number;
  min: number;
  max: number;
  levels: { v: number; label: string }[];
  color: string;
  label: string;
  unit: string;
  decimals?: number;
}) {
  const W = 240;
  const R = 86;
  const cx = W / 2;
  const cy = 108;
  const clampV = (v: number) => Math.max(min, Math.min(max, v));
  const ang = (v: number) => Math.PI * (1 - (clampV(v) - min) / (max - min)); // π at min (left) → 0 at max (right)
  const pt = (v: number, r: number) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))] as const;
  const arc = (a: number, b: number, r: number) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  // Spring the *value*, then derive the needle tip from it, so it always moves along the arc.
  const sv = useSpring(clampV(value), { stiffness: 120, damping: 18 });
  useEffect(() => {
    sv.set(clampV(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const tipX = useTransform(sv, (v) => pt(v, R - 12)[0]);
  const tipY = useTransform(sv, (v) => pt(v, R - 12)[1]);
  const tailX = useTransform(sv, (v) => cx - 12 * Math.cos(ang(v)));
  const tailY = useTransform(sv, (v) => cy + 12 * Math.sin(ang(v)));

  const reached = levels.filter((l) => value >= l.v).length;
  const valArc = value > min ? arc(min, clampV(value), R) : null;

  return (
    <div className="flex w-full flex-col items-center">
      <svg viewBox={`0 0 ${W} 128`} className="w-full max-w-[250px] overflow-visible">
        {/* track */}
        <path d={arc(min, max, R)} stroke="#e2dccb" strokeWidth="12" fill="none" />
        {/* payout bands */}
        {levels.map((l, i) => (
          <path key={i} d={arc(l.v, levels[i + 1]?.v ?? max, R)} stroke={color} strokeOpacity={0.22 + i * 0.25} strokeWidth="12" fill="none" />
        ))}
        {/* current reading as a thin arc inside the track */}
        {valArc && <path d={valArc} stroke={reached ? color : "#16150f"} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {/* scale */}
        {Array.from({ length: 11 }).map((_, i) => {
          const v = min + ((max - min) * i) / 10;
          const [x1, y1] = pt(v, R + 9);
          const [x2, y2] = pt(v, R + (i % 5 === 0 ? 16 : 12));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#16150f" strokeWidth="1" />;
        })}
        {/* level marks */}
        {levels.map((l, i) => {
          const [x1, y1] = pt(l.v, R - 8);
          const [x2, y2] = pt(l.v, R + 8);
          const [tx, ty] = pt(l.v, R - 22);
          return (
            <g key={`l${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#16150f" strokeWidth="2.5" />
              <text x={tx} y={ty + 3} fontSize="9" textAnchor="middle" fontFamily="var(--font-plex-mono)" fill="#16150f">
                L{i + 1}
              </text>
            </g>
          );
        })}
        {/* needle */}
        <motion.line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="#16150f" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6.5" fill="#16150f" />
        <circle cx={cx} cy={cy} r="2.5" fill={reached ? "#e9a100" : "#f4f1e8"} />
        <text x={cx - R} y={cy + 18} fontSize="9" fill="#868170" textAnchor="middle" fontFamily="var(--font-plex-mono)">
          {min}
        </text>
        <text x={cx + R} y={cy + 18} fontSize="9" fill="#868170" textAnchor="middle" fontFamily="var(--font-plex-mono)">
          {max}
        </text>
      </svg>
      <div className="-mt-1 text-center">
        <div className="mono text-[22px] font-semibold tabular-nums" style={{ color: reached ? color : "var(--ink)" }}>
          {value.toFixed(decimals)}
          <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>
        </div>
        <div className="caps text-ink-3">{label}</div>
        <div className="mono mt-0.5 text-[10.5px]" style={{ color: reached ? color : "var(--ink-2)" }}>
          {reached ? `level ${reached} reached` : `below ${levels[0].label}`}
        </div>
      </div>
    </div>
  );
}
