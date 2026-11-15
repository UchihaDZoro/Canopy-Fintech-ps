// Step 5: NEA Hawker Centres (GeoJSON) — real locations + stall counts.
// This is the real exposure base for the SME (hawker / stallholder) portfolio.
import path from "node:path";
import { fetchRetry, sleep, writeJson, readJson, haversineKm, OUT } from "./lib.mjs";

const DATASET = "d_4a086da0a5553be1d89383cd90d07ecd";
const BASE = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}`;

await fetchRetry(`${BASE}/initiate-download`, { asJson: true });
let url = null;
for (let i = 0; i < 20 && !url; i++) {
  await sleep(2000);
  const p = await fetchRetry(`${BASE}/poll-download`, { asJson: true });
  if (p?.data?.url && (!p.data.status || p.data.status === "DOWNLOAD_SUCCESS")) url = p.data.url;
}
if (!url) throw new Error("Hawker centre download not ready");
const geo = JSON.parse(await fetchRetry(url));

const stations = readJson(path.join(OUT, "stations.json"));
const rawProps = geo.features[0]?.properties ?? {};
console.log("  properties:", Object.keys(rawProps).join(", "));

const pick = (p, ...keys) => {
  for (const k of keys) {
    const hit = Object.keys(p).find((x) => x.toUpperCase() === k.toUpperCase());
    if (hit && p[hit] !== undefined && p[hit] !== null && p[hit] !== "") return p[hit];
  }
  return null;
};

// Some datasets embed an HTML attribute table in "Description"; parse it if present.
function parseDescription(desc) {
  const out = {};
  if (typeof desc !== "string") return out;
  const re = /<th>([^<]+)<\/th>\s*<td>([^<]*)<\/td>/g;
  let m;
  while ((m = re.exec(desc))) out[m[1].trim()] = m[2].trim();
  return out;
}

const centres = [];
for (const f of geo.features) {
  const p = { ...parseDescription(f.properties?.Description), ...f.properties };
  const [lon, lat] = f.geometry.type === "Point" ? f.geometry.coordinates : f.geometry.coordinates[0];
  const name = pick(p, "NAME", "name");
  if (!name) continue;
  const status = String(pick(p, "STATUS") ?? "Existing");
  if (/under construction|proposed/i.test(status)) continue;
  const stalls = Number(pick(p, "NUMBER_OF_COOKED_FOOD_STALLS", "NO_OF_FOOD_STALLS", "NO_OF_STALLS")) || null;
  const marketStalls = Number(pick(p, "NUMBER_OF_MARKET_STALLS", "NO_OF_MARKET_STALLS")) || 0;
  const nearest = stations
    .filter((s) => s.rainDays > 2000)
    .map((s) => ({ id: s.id, km: haversineKm({ lat, lon }, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
  centres.push({
    id: `HC${centres.length + 1}`,
    name: String(name).trim(),
    address: pick(p, "ADDRESS_MYENV", "ADDRESSSTREETNAME", "ADDRESS") ?? "",
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    stalls: stalls ?? 0,
    marketStalls,
    status,
    nearestStations: nearest.map((n) => ({ id: n.id, km: Number(n.km.toFixed(2)) })),
  });
}
writeJson(path.join(OUT, "hawker-centres.json"), centres);
const total = centres.reduce((a, c) => a + c.stalls, 0);
console.log(`Hawker centres: ${centres.length} centres, ${total} cooked-food stalls`);
