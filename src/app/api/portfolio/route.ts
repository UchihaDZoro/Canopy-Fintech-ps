import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_PORTFOLIO, portfolio } from "@/lib/engine/portfolio";
import { resolveProduct } from "@/lib/engine/product";

export const runtime = "nodejs";

const Body = z.object({
  product: z.unknown().optional(),
  options: z
    .object({
      takeUp: z.number().min(0.01).max(1),
      stopLossAttach: z.number().min(0.5).max(5),
      stopLossLimit: z.number().min(0.6).max(10),
    })
    .partial()
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  let spec;
  try {
    spec = resolveProduct(parsed.data.product);
  } catch (e) {
    return NextResponse.json({ error: "Invalid product spec", detail: String(e) }, { status: 400 });
  }
  const t0 = performance.now();
  const result = portfolio(spec, { ...DEFAULT_PORTFOLIO, ...parsed.data.options });
  return NextResponse.json({ product: spec, ...result, ms: Math.round(performance.now() - t0) });
}
