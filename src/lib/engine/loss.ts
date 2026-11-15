import { clamp } from "./math";
import type { LossModel } from "./types";

/** Modelled revenue drop (0..1) for a day — combines perils multiplicatively */
export function modelledLoss(m: LossModel, rain: number | null, wbgt: number | null, psi: number | null) {
  const dRain = rain === null ? 0 : clamp(m.rainSlope * (rain - m.rainFree), 0, m.rainCap);
  const dHeat = wbgt === null ? 0 : clamp(m.heatSlope * (wbgt - m.heatFree), 0, m.heatCap);
  const dHaze = psi === null || psi <= 100 ? 0 : clamp(m.hazeBase + m.hazeSlope * (psi - 100), 0, m.hazeCap);
  return 1 - (1 - dRain) * (1 - dHeat) * (1 - dHaze);
}
