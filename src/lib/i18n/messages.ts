import type { Lang } from "./policy";

/* Settlement messages sent with each PayNow transfer, in the customer's language.
   Every figure comes from the settlement result. Translations are drafts for Income's
   approved-wording review. */
export interface PayoutMsg {
  centre: string;
  peril: "rain" | "heat" | "haze" | null;
  value: number | null;
  gauge: string | null;
  gross: number;
  deducted: number;
  transfer: number;
  ref: string;
}
const PERIL_WORD: Record<Lang, Record<"rain" | "heat" | "haze", string>> = {
  en: { rain: "Heavy rain", heat: "Heat stress", haze: "Haze" },
  zh: { rain: "暴雨", heat: "高温", haze: "烟霾" },
  ms: { rain: "Hujan lebat", heat: "Haba", haze: "Jerebu" },
  ta: { rain: "கனமழை", heat: "வெப்பம்", haze: "புகைமூட்டம்" },
};
const READ = (p: "rain" | "heat" | "haze", v: number | null) => (v === null ? "-" : p === "rain" ? `${v}mm/1hr` : p === "heat" ? `WBGT ${v}C` : `PSI ${v}`);
const $$ = (v: number) => `S$${Number.isInteger(v) ? v : v.toFixed(2)}`;

export function payoutSms(lang: Lang, m: PayoutMsg) {
  if (!m.peril || m.transfer <= 0) {
    switch (lang) {
      case "zh":
        return `Daycover+（Income）：今天${m.centre}的读数未达到赔付水平，没有赔款。参考号${m.ref}`;
      case "ms":
        return `Daycover+ (Income): Bacaan hari ini di ${m.centre} tidak mencapai paras bayaran. Tiada bayaran. Ruj ${m.ref}`;
      case "ta":
        return `Daycover+ (Income): இன்று ${m.centre} அளவீடு செலுத்தும் நிலையை எட்டவில்லை. பணம் இல்லை. குறிப்பு ${m.ref}`;
      default:
        return `Daycover+ (Income): Today's readings at ${m.centre} did not reach a payout level, so nothing is paid. Ref ${m.ref}`;
    }
  }
  const w = PERIL_WORD[lang][m.peril];
  const r = READ(m.peril, m.value);
  const g = m.gauge ? ` @${m.gauge}` : "";
  const net = m.deducted > 0;
  switch (lang) {
    case "zh":
      return `Daycover+（Income）：${w} ${r}${g}。已转账${$$(m.transfer)}到您的PayNow${net ? `（应付${$$(m.gross)}减昨晚预付${$$(m.deducted)}）` : ""}。无需索赔。参考号${m.ref}`;
    case "ms":
      return `Daycover+ (Income): ${w} ${r}${g}. ${$$(m.transfer)} dihantar ke PayNow anda${net ? ` (${$$(m.gross)} tolak pendahuluan ${$$(m.deducted)})` : ""}. Tiada tuntutan diperlukan. Ruj ${m.ref}`;
    case "ta":
      return `Daycover+ (Income): ${w} ${r}${g}. ${$$(m.transfer)} உங்கள் PayNow-க்கு அனுப்பப்பட்டது${net ? ` (${$$(m.gross)} - முன்பணம் ${$$(m.deducted)})` : ""}. கோரிக்கை தேவையில்லை. குறிப்பு ${m.ref}`;
    default:
      return `Daycover+ (Income): ${w} ${r}${g}. ${$$(m.transfer)} sent to your PayNow${net ? ` (${$$(m.gross)} less ${$$(m.deducted)} advanced last night)` : ""}. No claim needed. Ref ${m.ref}`;
  }
}

export function advanceSms(lang: Lang, centre: string, amount: number, forecast: string) {
  switch (lang) {
    case "zh":
      return `Daycover+（Income）：NEA预报明天${forecast}。已预付${$$(amount)}到您的PayNow，可少备货。将从下次赔款中扣除，无需退还。`;
    case "ms":
      return `Daycover+ (Income): NEA ramal ${forecast} esok. ${$$(amount)} pendahuluan dihantar ke PayNow untuk ${centre}. Ditolak daripada bayaran seterusnya, tidak perlu dibayar balik.`;
    case "ta":
      return `Daycover+ (Income): நாளை ${forecast} என NEA முன்னறிவிப்பு. ${$$(amount)} முன்பணம் PayNow-க்கு அனுப்பப்பட்டது. அடுத்த தொகையில் கழிக்கப்படும்.`;
    default:
      return `Daycover+ (Income): NEA forecasts ${forecast.toLowerCase()} tomorrow. ${$$(amount)} advance sent to your PayNow for ${centre} - buy a little less stock. Taken off your next payout, never owed back.`;
  }
}
