import { NextResponse } from "next/server";
import { z } from "zod";
import { runBacktest } from "@/lib/engine/backtest";
import { islandBaseline } from "@/lib/engine/portfolio";
import { priceQuote } from "@/lib/engine/pricing";
import { resolveProduct } from "@/lib/engine/product";

export const runtime = "nodejs";

const Body = z.object({
  lat: z.number().min(1.15).max(1.48),
  lon: z.number().min(103.6).max(104.1),
  label: z.string().max(120).optional(),
  product: z.unknown().optional(),
  includeDays: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { lat, lon, label, includeDays } = parsed.data;
  let spec;
  try {
    spec = resolveProduct(parsed.data.product);
  } catch (e) {
    return NextResponse.json({ error: "Invalid product spec", detail: String(e) }, { status: 400 });
  }
  const t0 = performance.now();
  const bt = runBacktest({ lat, lon, label }, spec, { includeDays: includeDays ?? true });
  const island = islandBaseline(spec);
  const quote = priceQuote(bt, spec, island);
  return NextResponse.json({ product: spec, backtest: bt, quote, island, ms: Math.round(performance.now() - t0) });
}
