import "server-only";
import type { Country, ParsedPhone } from "./phone";

// SMS gateways. Credentials come only from the server environment (.env.local) and are never
// sent to the browser. Routing:
//   India (+91)      → Fast2SMS if FAST2SMS_API_KEY is set, otherwise Twilio
//   Singapore (+65)  → Twilio
export type ProviderId = "fast2sms" | "twilio";

export interface SendResult {
  ok: boolean;
  provider: ProviderId;
  id?: string;
  status?: string;
  error?: string;
}

const env = () => ({
  fast2smsKey: process.env.FAST2SMS_API_KEY,
  fast2smsUrl: process.env.FAST2SMS_URL ?? "https://www.fast2sms.com/dev/bulkV2",
  twilioSid: process.env.TWILIO_ACCOUNT_SID,
  twilioToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFrom: process.env.TWILIO_FROM,
  twilioBase: process.env.TWILIO_API_BASE ?? "https://api.twilio.com",
});

export function configured() {
  const e = env();
  return { fast2sms: !!e.fast2smsKey, twilio: !!(e.twilioSid && e.twilioToken && e.twilioFrom) };
}

export function routeFor(country: Country): ProviderId | null {
  const c = configured();
  if (country === "IN") return c.fast2sms ? "fast2sms" : c.twilio ? "twilio" : null;
  return c.twilio ? "twilio" : null;
}

// GSM-7 covers plain English; anything else (Chinese, Tamil, ≥, —) needs Unicode
const isGsm = (s: string) => /^[\x20-\x7E\n£¥èéùìòÇØøÅåÄÖÑÜäöñüà§¿¡]*$/.test(s);

async function viaFast2sms(phone: ParsedPhone, body: string): Promise<SendResult> {
  const e = env();
  const res = await fetch(e.fast2smsUrl, {
    method: "POST",
    headers: { authorization: e.fast2smsKey!, "Content-Type": "application/json", "cache-control": "no-cache" },
    // "q" = Quick SMS route (no DLT template needed); Unicode for non-English text
    body: JSON.stringify({ route: "q", message: body, language: isGsm(body) ? "english" : "unicode", flash: 0, numbers: phone.national }),
    signal: AbortSignal.timeout(12000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.return !== true) {
    const msg = Array.isArray(j?.message) ? j.message.join(" ") : j?.message;
    return { ok: false, provider: "fast2sms", error: msg || `Fast2SMS error ${res.status}` };
  }
  return { ok: true, provider: "fast2sms", id: j.request_id, status: Array.isArray(j.message) ? j.message.join(" ") : "queued" };
}

async function viaTwilio(phone: ParsedPhone, body: string): Promise<SendResult> {
  const e = env();
  const res = await fetch(`${e.twilioBase}/2010-04-01/Accounts/${e.twilioSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.twilioSid}:${e.twilioToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone.e164!, From: e.twilioFrom!, Body: body }),
    signal: AbortSignal.timeout(12000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, provider: "twilio", error: j?.message ?? `Twilio error ${res.status}` };
  return { ok: true, provider: "twilio", id: j.sid, status: j.status };
}

export async function sendSms(phone: ParsedPhone, body: string): Promise<SendResult | null> {
  const p = routeFor(phone.country!);
  if (!p) return null;
  try {
    return p === "fast2sms" ? await viaFast2sms(phone, body) : await viaTwilio(phone, body);
  } catch (err) {
    return { ok: false, provider: p, error: (err as Error).message };
  }
}
