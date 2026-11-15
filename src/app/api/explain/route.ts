import { NextResponse } from "next/server";
import { z } from "zod";
import { explainDay } from "@/lib/engine/explain";
import { resolveProduct } from "@/lib/engine/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  lat: z.number().min(1.15).max(1.48),
  lon: z.number().min(103.6).max(104.1),
  label: z.string().max(140).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product: z.unknown().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { lat, lon, label, date } = parsed.data;
  if (date < "2014-01-01") return NextResponse.json({ error: "Records start 2014-01-01" }, { status: 400 });
  try {
    const trace = await explainDay({ lat, lon, label }, date, resolveProduct(parsed.data.product));
    return NextResponse.json(trace);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
