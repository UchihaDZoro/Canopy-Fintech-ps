// Phone number parsing shared by the browser and the server, so both agree on what is valid.
// Singapore mobiles: 8 digits starting 8 or 9.  Indian mobiles: 10 digits starting 6–9.

export type Country = "SG" | "IN";
export const COUNTRIES: { id: Country; flag: string; dial: string; example: string; label: string }[] = [
  { id: "IN", flag: "🇮🇳", dial: "+91", example: "98765 43210", label: "India" },
  { id: "SG", flag: "🇸🇬", dial: "+65", example: "9123 4567", label: "Singapore" },
];

export interface ParsedPhone {
  valid: boolean;
  e164: string | null;
  country: Country | null;
  national: string | null; // digits without country code (Fast2SMS wants this for India)
  error?: string;
}

export function parsePhone(raw: string, fallback: Country): ParsedPhone {
  let d = raw.trim().replace(/[\s().-]/g, "");
  if (!d) return { valid: false, e164: null, country: null, national: null, error: "Enter a mobile number" };
  if (d.startsWith("00")) d = `+${d.slice(2)}`;

  const asIN = (n: string): ParsedPhone =>
    /^[6-9]\d{9}$/.test(n)
      ? { valid: true, e164: `+91${n}`, country: "IN", national: n }
      : { valid: false, e164: null, country: "IN", national: null, error: "Indian mobile numbers have 10 digits starting 6–9, e.g. 98765 43210" };
  const asSG = (n: string): ParsedPhone =>
    /^[89]\d{7}$/.test(n)
      ? { valid: true, e164: `+65${n}`, country: "SG", national: n }
      : { valid: false, e164: null, country: "SG", national: null, error: "Singapore mobile numbers have 8 digits starting 8 or 9, e.g. 9123 4567" };

  if (d.startsWith("+91")) return asIN(d.slice(3));
  if (d.startsWith("+65")) return asSG(d.slice(3));
  if (d.startsWith("+")) return { valid: false, e164: null, country: null, national: null, error: "Only Indian (+91) and Singapore (+65) mobile numbers are supported" };

  if (fallback === "IN") {
    if (/^0[6-9]\d{9}$/.test(d)) return asIN(d.slice(1)); // trunk prefix 0
    if (/^91[6-9]\d{9}$/.test(d)) return asIN(d.slice(2));
    return asIN(d);
  }
  if (/^65[89]\d{7}$/.test(d)) return asSG(d.slice(2));
  return asSG(d);
}

export const maskPhone = (e164: string) => e164.replace(/\d(?=\d{4})/g, "•");
