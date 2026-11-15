import type { ProductSpec } from "@/lib/engine/types";

// Point-of-sale disclosure: the whole product in one SMS, in the customer's language.
// Every number is filled from the product spec and the customer's own gauge —
// nothing here is product-specific text. Translations are drafts for Income's
// translation team to approve (regulated disclosure must use approved wording).

export type Lang = "en" | "zh" | "ms" | "ta";
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "zh", label: "Chinese", native: "中文" },
  { id: "ms", label: "Malay", native: "Bahasa Melayu" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
];

export interface SmsContext {
  spec: ProductSpec;
  weekly: number;
  gauge: { id: string; name: string };
}

const money = (v: number) => `S$${Math.round(v)}`;

/** Full point-of-sale disclosure (all tiers, Prep Pay, exclusions) */
export function policyFull(lang: Lang, { spec, weekly, gauge }: SmsContext) {
  const inc = spec.insuredDailyIncome;
  const [r1, r2] = spec.perils.rain.tiers;
  const [h1, h2] = spec.perils.heat.tiers;
  const [z1, z2] = spec.perils.haze.tiers;
  const a = (t?: { payoutPct: number }) => (t ? money(t.payoutPct * inc) : "");
  const adv = money(spec.prepPay.advancePct * inc);
  const w = `S$${weekly.toFixed(2)}`;
  const g = `${gauge.id} (${gauge.name})`;
  const cap = spec.maxPayableDaysPerYear;
  const rain = spec.perils.rain.enabled && r1;
  const heat = spec.perils.heat.enabled && h1;
  const haze = spec.perils.haze.enabled && z1;
  const prep = spec.prepPay.enabled;

  switch (lang) {
    case "zh":
      return [
        `Canopy（Income）：每周${w}。`,
        rain ? `雨量站${g}一小时降雨≥${r1.threshold}毫米赔${a(r1)}${r2 ? `，≥${r2.threshold}毫米赔${a(r2)}` : ""}；` : "",
        heat ? `WBGT≥${h1.threshold}${h2 ? `/${h2.threshold}` : ""}°C赔${a(h1)}${h2 ? `/${a(h2)}` : ""}；` : "",
        haze ? `PSI≥${z1.threshold}${z2 ? `/${z2.threshold}` : ""}赔${a(z1)}${z2 ? `/${a(z2)}` : ""}。` : "",
        prep ? `前一晚预报大雷雨先付${adv}。` : "",
        `每年最多${cap}天。只按官方读数赔付——您可能有损失却拿不到钱。不保受伤或财物损坏。`,
      ].join("");
    case "ms":
      return [
        `Canopy (Income): ${w}/minggu. `,
        rain ? `Bayar ${a(r1)} jika hujan ≥${r1.threshold}mm dalam 1 jam di tolok ${g}${r2 ? `, ${a(r2)} jika ≥${r2.threshold}mm` : ""}; ` : "",
        heat ? `${a(h1)}${h2 ? `/${a(h2)}` : ""} jika WBGT ≥${h1.threshold}${h2 ? `/${h2.threshold}` : ""}°C; ` : "",
        haze ? `${a(z1)}${z2 ? `/${a(z2)}` : ""} jika PSI ≥${z1.threshold}${z2 ? `/${z2.threshold}` : ""}. ` : "",
        prep ? `Pendahuluan ${adv} pada malam sebelum ribut lebat diramal. ` : "",
        `Maks ${cap} hari/tahun. Dibayar ikut bacaan rasmi sahaja — anda mungkin rugi tetapi tidak dibayar. Tidak meliputi kecederaan atau kerosakan.`,
      ].join("");
    case "ta":
      return [
        `Canopy (Income): வாரம் ${w}. `,
        rain ? `${g} மழைமானியில் 1 மணி நேரத்தில் ≥${r1.threshold}மிமீ மழை: ${a(r1)}${r2 ? `, ≥${r2.threshold}மிமீ: ${a(r2)}` : ""}; ` : "",
        heat ? `WBGT ≥${h1.threshold}${h2 ? `/${h2.threshold}` : ""}°C: ${a(h1)}${h2 ? `/${a(h2)}` : ""}; ` : "",
        haze ? `PSI ≥${z1.threshold}${z2 ? `/${z2.threshold}` : ""}: ${a(z1)}${z2 ? `/${a(z2)}` : ""}. ` : "",
        prep ? `கடும் புயல் முன்னறிவிப்பு என்றால் முந்தைய மாலை ${adv} முன்பணம். ` : "",
        `ஆண்டுக்கு அதிகபட்சம் ${cap} நாட்கள். அதிகாரப்பூர்வ அளவீட்டின்படி மட்டுமே பணம் — இழப்பு ஏற்பட்டாலும் பணம் கிடைக்காமல் போகலாம். காயம் அல்லது சேதத்திற்கு அல்ல.`,
      ].join("");
    default:
      return [
        `Canopy (Income): ${w}/wk. `,
        rain ? `Pays ${a(r1)} if ≥${r1.threshold}mm rain falls in 1 hr at gauge ${g}${r2 ? `, ${a(r2)} if ≥${r2.threshold}mm` : ""}; ` : "",
        heat ? `${a(h1)}${h2 ? `/${a(h2)}` : ""} if WBGT ≥${h1.threshold}${h2 ? `/${h2.threshold}` : ""}°C; ` : "",
        haze ? `${a(z1)}${z2 ? `/${a(z2)}` : ""} if PSI ≥${z1.threshold}${z2 ? `/${z2.threshold}` : ""}. ` : "",
        prep ? `${adv} advance the evening before a forecast heavy storm (max ${spec.prepPay.maxPerYear}/yr${spec.prepPay.recoup ? ", taken off your next payout, never owed back" : ""}). ` : "",
        `Max ${cap} days/yr. Pays on the official reading only — you can lose sales and get nothing. Not for injury or damage.`,
      ].join("");
  }
}

/** The one-SMS version: first-tier triggers, top rain tier, cap and the no-pay rule.
 *  English/Malay stay in GSM-7 (no "≥" or em dash) so they fit one 160-char segment. */
export function policySms(lang: Lang, { spec, weekly, gauge }: SmsContext) {
  const inc = spec.insuredDailyIncome;
  const r = spec.perils.rain.enabled ? spec.perils.rain.tiers : [];
  const h = spec.perils.heat.enabled ? spec.perils.heat.tiers[0] : null;
  const z = spec.perils.haze.enabled ? spec.perils.haze.tiers[0] : null;
  const $ = (t: { payoutPct: number }) => money(t.payoutPct * inc);
  const w = `S$${weekly.toFixed(2)}`;
  const cap = spec.maxPayableDaysPerYear;
  const r1 = r[0];
  const r2 = r[1];
  const sameHZ = h && z && $(h) === $(z);
  switch (lang) {
    case "zh": {
      const rain = r1 ? `${gauge.id}站每小时雨${r1.threshold}毫米赔${$(r1)}${r2 ? `,${r2.threshold}毫米赔${$(r2)}` : ""};` : "";
      const hz = sameHZ ? `WBGT${h!.threshold}度/PSI${z!.threshold}赔${$(h!)}。` : `${h ? `WBGT${h.threshold}度赔${$(h)};` : ""}${z ? `PSI${z.threshold}赔${$(z)}。` : ""}`;
      return `每周${w}：${rain}${hz}每年最多${cap}天,只按读数赔。`;
    }
    case "ta": {
      const rain = r1 ? `${gauge.id}-ல் 1மணி ${r1.threshold}மிமீ மழை ${$(r1)}${r2 ? `, ${r2.threshold}மிமீ ${$(r2)}` : ""}; ` : "";
      const hz = sameHZ ? `WBGT ${h!.threshold}/PSI ${z!.threshold}: ${$(h!)}. ` : `${h ? `WBGT ${h.threshold}: ${$(h)}; ` : ""}${z ? `PSI ${z.threshold}: ${$(z)}. ` : ""}`;
      return `Canopy வாரம் ${w}: ${rain}${hz}ஆண்டு ${cap} நாள். அளவீடு மட்டும்.`;
    }
    case "ms": {
      const rain = r1 ? `${$(r1)} jika hujan ${r1.threshold}mm+ sejam di tolok ${gauge.id}${r2 ? ` (${$(r2)} jika ${r2.threshold}mm+)` : ""}; ` : "";
      const hz = `${h ? `${$(h)} jika WBGT ${h.threshold}C+; ` : ""}${z ? `${$(z)} jika PSI ${z.threshold}+. ` : ""}`;
      return `Canopy ${w}/mgg: ${rain}${hz}Maks ${cap} hari/thn. Ikut bacaan sahaja.`;
    }
    default: {
      const rain = r1 ? `${$(r1)} if ${r1.threshold}mm+ rain in 1hr at gauge ${gauge.id}${r2 ? ` (${$(r2)} at ${r2.threshold}mm+)` : ""}; ` : "";
      const hz = `${h ? `${$(h)} if WBGT ${h.threshold}C+; ` : ""}${z ? `${$(z)} if PSI ${z.threshold}+. ` : ""}`;
      return `Canopy ${w}/wk: ${rain}${hz}Max ${cap} days/yr. Pays on readings only, not damage.`;
    }
  }
}

/** SMS segment maths: GSM-7 160/153 per segment, otherwise UCS-2 70/67 */
export function smsSegments(text: string) {
  const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const EXT = "^{}\\[~]|€";
  const chars = [...text];
  const unicode = chars.some((c) => !GSM.includes(c) && !EXT.includes(c));
  const len = unicode ? chars.length : chars.reduce((a, c) => a + (EXT.includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { len, unicode, segments: len <= single ? 1 : Math.ceil(len / multi) };
}

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

/** Teach-back: 3 questions built from the customer's own policy, incl. the no-pay level */
export function teachBack(lang: Lang, { spec, gauge }: SmsContext): QuizQ[] {
  const inc = spec.insuredDailyIncome;
  const r1 = spec.perils.rain.tiers[0];
  const z = spec.perils.haze.tiers;
  const below = Math.max(1, r1.threshold - 5);
  const r1Amt = money(r1.payoutPct * inc);
  const hazeTop = z[z.length - 1];
  const hazeLevel = hazeTop.threshold + 29;
  const hazeAmt = money(hazeTop.payoutPct * inc);
  const hazeLow = money(z[0].payoutPct * inc);
  const T = {
    en: {
      q1: `${below} mm of rain falls in one hour at gauge ${gauge.id}. What does Canopy pay?`,
      q2: `The 24-hour PSI in your region reaches ${hazeLevel}. What does Canopy pay that day?`,
      q3: `Your stall's fridge is damaged in a flash flood. Does Canopy pay for the repair?`,
      yes: "Yes",
      no: "No — Canopy pays on the weather reading, not for damage",
      w1: `Nothing: the first level is ${r1.threshold} mm. Below it, Canopy does not pay even if you lose sales.`,
      w2: `PSI ${hazeLevel} is above ${hazeTop.threshold}, the top haze level.`,
      w3: "Damage is covered by property insurance (e.g. SmartBiz360). Canopy only replaces income on trigger days.",
    },
    zh: {
      q1: `雨量站${gauge.id}一小时下了${below}毫米雨，Canopy赔多少？`,
      q2: `您所在地区的24小时PSI达到${hazeLevel}，当天Canopy赔多少？`,
      q3: `突发水灾弄坏了摊位的冰箱，Canopy会赔维修费吗？`,
      yes: "会",
      no: "不会——Canopy只按天气读数赔付，不赔损坏",
      w1: `不赔：第一级是${r1.threshold}毫米，低于这个读数即使生意受损也不赔。`,
      w2: `PSI ${hazeLevel}超过最高一级${hazeTop.threshold}。`,
      w3: "财物损坏由财产保险（如SmartBiz360）负责，Canopy只补贴触发日的收入。",
    },
    ms: {
      q1: `Hujan ${below} mm turun dalam satu jam di tolok ${gauge.id}. Berapakah Canopy bayar?`,
      q2: `PSI 24 jam di kawasan anda mencecah ${hazeLevel}. Berapakah Canopy bayar hari itu?`,
      q3: `Peti sejuk gerai anda rosak akibat banjir kilat. Adakah Canopy bayar kos baiki?`,
      yes: "Ya",
      no: "Tidak — Canopy bayar ikut bacaan cuaca, bukan kerosakan",
      w1: `Tiada: paras pertama ialah ${r1.threshold} mm. Di bawahnya, tiada bayaran walaupun jualan merosot.`,
      w2: `PSI ${hazeLevel} melebihi ${hazeTop.threshold}, paras jerebu tertinggi.`,
      w3: "Kerosakan dilindungi insurans harta (cth. SmartBiz360). Canopy hanya menggantikan pendapatan.",
    },
    ta: {
      q1: `${gauge.id} மழைமானியில் ஒரு மணி நேரத்தில் ${below} மிமீ மழை. Canopy எவ்வளவு தரும்?`,
      q2: `உங்கள் பகுதியின் 24 மணி நேர PSI ${hazeLevel} ஆகிறது. அன்று Canopy எவ்வளவு தரும்?`,
      q3: `திடீர் வெள்ளத்தில் கடையின் குளிர்சாதனப் பெட்டி சேதமடைந்தது. பழுதுபார்ப்புக்கு Canopy பணம் தருமா?`,
      yes: "ஆம்",
      no: "இல்லை — Canopy வானிலை அளவீட்டின்படி மட்டுமே தரும், சேதத்திற்கு அல்ல",
      w1: `ஒன்றுமில்லை: முதல் நிலை ${r1.threshold} மிமீ. அதற்குக் கீழே விற்பனை குறைந்தாலும் பணம் இல்லை.`,
      w2: `PSI ${hazeLevel}, உயர்ந்த நிலையான ${hazeTop.threshold}-ஐ விட அதிகம்.`,
      w3: "சேதம் சொத்துக் காப்பீட்டில் (எ.கா. SmartBiz360) அடங்கும். Canopy வருமானத்தை மட்டுமே ஈடுசெய்யும்.",
    },
  }[lang];
  return [
    { q: T.q1, options: ["S$0", r1Amt, money(spec.perils.rain.tiers.at(-1)!.payoutPct * inc)], answer: 0, why: T.w1 },
    { q: T.q2, options: [hazeLow, hazeAmt, "S$0"], answer: 1, why: T.w2 },
    { q: T.q3, options: [T.yes, T.no], answer: 1, why: T.w3 },
  ];
}
