import { NextResponse } from "next/server";
import { liveStatus } from "@/lib/live/status";
import { resolveProduct } from "@/lib/engine/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await liveStatus(resolveProduct()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await liveStatus(resolveProduct(body?.product)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
