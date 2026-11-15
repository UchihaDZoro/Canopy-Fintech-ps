"use client";
import { motion } from "motion/react";
import { scaleBand, scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
import { useMemo, useState } from "react";

type Size = { w?: number; h?: number };

/** Changi 1981→: hot days (bars) + annual mean temperature (line) */
export function ClimateChart({ years, w = 760, h = 260 }: { years: { year: number; hot34: number; tmean: number | null }[] } & Size) {
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 18, r: 44, b: 26, l: 34 };
  const x = scaleBand<number>().domain(years.map((y) => y.year)).range([m.l, w - m.r]).padding(0.28);
  const yMax = Math.max(...years.map((y) => y.hot34)) * 1.1;
  const y = scaleLinear().domain([0, yMax]).range([h - m.b, m.t]);
  const temps = years.filter((d) => d.tmean !== null) as { year: number; tmean: number; hot34: number }[];
  const t = scaleLinear()
    .domain([Math.min(...temps.map((d) => d.tmean)) - 0.2, Math.max(...temps.map((d) => d.tmean)) + 0.2])
    .range([h - m.b, m.t]);
  const path = line<{ year: number; tmean: number }>()
    .x((d) => x(d.year)! + x.bandwidth() / 2)
    .y((d) => t(d.tmean))
    .curve(curveMonotoneX)(temps);
  const hv = hover !== null ? years.find((d) => d.year === hover) : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="hotbar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d2480f" />
          <stop offset="1" stopColor="#d2480f" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {y.ticks(4).map((v) => (
        <g key={v}>
          <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="rgba(22,21,15,0.1)" />
          <text x={m.l - 8} y={y(v) + 3} fontSize="10" textAnchor="end" fill="#868170">{v}</text>
        </g>
      ))}
      {years.map((d, i) => (
        <motion.rect
          key={d.year}
          x={x(d.year)}
          width={x.bandwidth()}
          rx={2}
          fill="url(#hotbar)"
          opacity={hover === null || hover === d.year ? 1 : 0.35}
          initial={{ y: h - m.b, height: 0 }}
          whileInView={{ y: y(d.hot34), height: h - m.b - y(d.hot34) }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={() => setHover(d.year)}
        />
      ))}
      {path && (
        <motion.path
          d={path}
          fill="none"
          stroke="#16150f"
          strokeWidth={1.6}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: "easeInOut", delay: 0.4 }}
        />
      )}
      {t.ticks(4).map((v) => (
        <text key={v} x={w - m.r + 8} y={t(v) + 3} fontSize="10" fill="#4a473d">{v.toFixed(1)}°</text>
      ))}
      {years.filter((_, i) => i % 5 === 0).map((d) => (
        <text key={d.year} x={x(d.year)! + x.bandwidth() / 2} y={h - 8} fontSize="10" textAnchor="middle" fill="#868170">{d.year}</text>
      ))}
      {hv && (
        <g transform={`translate(${Math.min(x(hv.year)! + 10, w - 170)}, ${m.t + 4})`}>
          <rect width="150" height="44" rx="8" fill="#fbf9f3" stroke="#16150f" />
          <text x="10" y="18" fontSize="11" fill="#16150f" fontWeight="600">{hv.year}</text>
          <text x="10" y="34" fontSize="10.5" fill="#4a473d">{hv.hot34} days ≥34°C · {hv.tmean?.toFixed(2)}°C mean</text>
        </g>
      )}
    </svg>
  );
}

/** Portfolio loss ratio per year with reinsurance recoveries */
export function LossRatioChart({
  years,
  w = 760,
  h = 240,
}: { years: { year: number; lossRatio: number; netLossRatio: number; payout: number }[] } & Size) {
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 16, r: 16, b: 26, l: 40 };
  const x = scaleBand<number>().domain(years.map((y) => y.year)).range([m.l, w - m.r]).padding(0.3);
  const yMax = Math.max(1.1, ...years.map((y) => y.lossRatio)) * 1.08;
  const y = scaleLinear().domain([0, yMax]).range([h - m.b, m.t]);
  const hv = years.find((d) => d.year === hover);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHover(null)}>
      {y.ticks(5).map((v) => (
        <g key={v}>
          <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="rgba(22,21,15,0.1)" />
          <text x={m.l - 8} y={y(v) + 3} fontSize="10" textAnchor="end" fill="#868170">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <line x1={m.l} x2={w - m.r} y1={y(1)} y2={y(1)} stroke="#c0262d" strokeDasharray="4 4" strokeOpacity={0.6} />
      <text x={w - m.r} y={y(1) - 5} fontSize="10" textAnchor="end" fill="#c0262d">100% — premium fully paid out</text>
      {years.map((d, i) => (
        <g key={d.year} onMouseEnter={() => setHover(d.year)}>
          <rect x={x(d.year)! - 4} y={m.t} width={x.bandwidth() + 8} height={h - m.b - m.t} fill="transparent" />
          <motion.rect
            x={x(d.year)}
            width={x.bandwidth()}
            rx={3}
            fill={d.lossRatio > 1 ? "#c0262d" : "#0b6e4f"}
            opacity={hover === null || hover === d.year ? 0.9 : 0.4}
            initial={{ y: h - m.b, height: 0 }}
            whileInView={{ y: y(d.netLossRatio), height: h - m.b - y(d.netLossRatio) }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          />
          {d.lossRatio > d.netLossRatio && (
            <rect x={x(d.year)} width={x.bandwidth()} y={y(d.lossRatio)} height={y(d.netLossRatio) - y(d.lossRatio)} fill="#6f52a3" opacity={0.7} rx={3} />
          )}
          <text x={x(d.year)! + x.bandwidth() / 2} y={h - 8} fontSize="10" textAnchor="middle" fill="#868170">
            {String(d.year).slice(2)}
          </text>
        </g>
      ))}
      {hv && (
        <g transform={`translate(${Math.min(x(hv.year)! + 14, w - 190)}, ${m.t + 6})`}>
          <rect width="176" height="46" rx="8" fill="#fbf9f3" stroke="#16150f" />
          <text x="10" y="19" fontSize="11" fill="#16150f" fontWeight="600">{hv.year} · loss ratio {(hv.lossRatio * 100).toFixed(0)}%</text>
          <text x="10" y="35" fontSize="10.5" fill="#4a473d">S${Math.round(hv.payout).toLocaleString()} paid to stallholders</text>
        </g>
      )}
    </svg>
  );
}

/** Small sparkline-ish area chart */
export function AreaSpark({ values, color = "#0b6e4f", w = 240, h = 60 }: { values: number[]; color?: string } & Size) {
  const d = useMemo(() => {
    const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
    const y = scaleLinear().domain([0, Math.max(...values, 1)]).range([h - 2, 4]);
    return {
      a: area<number>().x((_, i) => x(i)).y0(h).y1((v) => y(v)).curve(curveMonotoneX)(values) ?? "",
      l: line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values) ?? "",
    };
  }, [values, w, h]);
  const id = `sp-${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d.a} fill={`url(#${id})`} />
      <motion.path d={d.l} fill="none" stroke={color} strokeWidth={1.6} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4 }} />
    </svg>
  );
}
