import { NextResponse } from "next/server";
import { z } from "zod";
import { maskPhone, parsePhone } from "@/lib/sms/phone";
import { configured, routeFor, sendSms } from "@/lib/sms/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends the payout SMS through a real gateway when one is configured (see lib/sms/providers).
// Without credentials it returns the message as an on-screen delivery and says so — it never
// claims to have sent something it didn't.
const Body = z.object({
  to: z.string().trim().max(32),
  country: z.enum(["SG", "IN"]).default("IN"),
  body: z.string().min(1).max(640),
});

const PROVIDER_NAME = { fast2sms: "Fast2SMS", twilio: "Twilio" } as const;
const lastSent = new Map<string, number>();

/** Which gateways are configured (no secrets) — the page shows this before you send */
export async function GET() {
  const c = configured();
  return NextResponse.json({ configured: c, route: { IN: routeFor("IN"), SG: routeFor("SG") } });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "failed", error: "Missing number or message" }, { status: 400 });
  const phone = parsePhone(parsed.data.to, parsed.data.country);
  if (!phone.valid) return NextResponse.json({ status: "failed", error: phone.error }, { status: 400 });

  // Abuse guard: one message per number every 20 seconds
  const now = Date.now();
  if (now - (lastSent.get(phone.e164!) ?? 0) < 20_000) {
    return NextResponse.json({ status: "failed", error: "Please wait 20 seconds before sending to this number again" }, { status: 429 });
  }

  const masked = maskPhone(phone.e164!);
  const res = await sendSms(phone, parsed.data.body);
  if (!res) {
    const need =
      phone.country === "IN"
        ? "FAST2SMS_API_KEY (or Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)"
        : "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM";
    return NextResponse.json({
      status: "simulated",
      to: masked,
      body: parsed.data.body,
      note: `No SMS gateway is configured for ${phone.country === "IN" ? "India" : "Singapore"}, so the message is on the on-screen phone only. Add ${need} to .env.local and restart.`,
    });
  }
  lastSent.set(phone.e164!, now);
  if (!res.ok) return NextResponse.json({ status: "failed", to: masked, provider: PROVIDER_NAME[res.provider], error: res.error }, { status: 502 });
  return NextResponse.json({ status: "sent", to: masked, provider: PROVIDER_NAME[res.provider], providerId: res.id, providerStatus: res.status, body: parsed.data.body });
}
