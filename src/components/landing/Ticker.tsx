"use client";
import type { LiveResponse } from "@/lib/client/types";

/** Scrolling strip of the actual readings the engine pulled in its last fetch */
export function Ticker({ live }: { live: LiveResponse | null }) {
  const items: { k: string; v: string; c: string }[] = [];
  if (live) {
    const rain = [...live.rainStations].sort((a, b) => b.max60Today - a.max60Today).slice(0, 10);
    for (const s of rain) items.push({ k: `${s.id} ${s.name}`, v: `${s.max60Today.toFixed(1)} mm/60min`, c: "#7fb2ff" });
    for (const w of [...live.wbgtStations].sort((a, b) => b.latest - a.latest).slice(0, 6)) items.push({ k: `WBGT ${w.name}`, v: `${w.latest.toFixed(1)}°C ${w.heatStress}`, c: "#ff9c6e" });
    if (live.psi) for (const [r, v] of Object.entries(live.psi.psi24)) items.push({ k: `PSI ${r}`, v: String(v), c: "#c3a8f0" });
    if (live.forecast?.tomorrow) items.push({ k: "Tomorrow", v: live.forecast.tomorrow.text.central || live.forecast.general, c: "#8cf5b5" });
  }
  const row = items.length ? items : [{ k: "connecting to data.gov.sg", v: "…", c: "#8cf5b5" }];
  return (
    <div className="scope overflow-hidden border-y-2 border-ink">
      <div className="flex items-center">
        <span className="caps z-10 shrink-0 border-r border-[var(--scope-line)] bg-scope px-4 py-3 text-phosphor">
          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-phosphor blink" />
          Live wire
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex w-max animate-[marquee_60s_linear_infinite] gap-10 whitespace-nowrap py-3 pl-6">
            {[...row, ...row].map((x, i) => (
              <span key={i} className="mono text-[12px] text-[#9fc2ad]">
                {x.k} <span style={{ color: x.c }}>{x.v}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}
