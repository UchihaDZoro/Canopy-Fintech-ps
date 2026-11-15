// Step 9: URA Master Plan 2019 Planning Area boundaries (no sea) → simplified polygons
// for the 3D island and the risk map. Douglas–Peucker simplification keeps it light.
import path from "node:path";
import { fetchRetry, sleep, writeJson, OUT } from "./lib.mjs";

const DATASET = "d_4765db0e87b9c86336792efe8a1f7a66";
const BASE = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}`;
const TOL = Number(process.env.SIMPLIFY_TOL ?? 0.0006); // degrees (~65 m)

await fetchRetry(`${BASE}/initiate-download`, { asJson: true });
let url = null;
for (let i = 0; i < 20 && !url; i++) {
  await sleep(2000);
  const p = await fetchRetry(`${BASE}/poll-download`, { asJson: true });
  if (p?.data?.url && (!p.data.status || p.data.status === "DOWNLOAD_SUCCESS")) url = p.data.url;
}
if (!url) throw new Error("Planning area download not ready");
const geo = JSON.parse(await fetchRetry(url));

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function dp(points, tol) {
  if (points.length < 3) return points;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points.at(-1));
    if (d > max) { max = d; idx = i; }
  }
  if (max > tol) return [...dp(points.slice(0, idx + 1), tol).slice(0, -1), ...dp(points.slice(idx), tol)];
  return [points[0], points.at(-1)];
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;

function parseDescription(desc) {
  const out = {};
  if (typeof desc !== "string") return out;
  const re = /<th>([^<]+)<\/th>\s*<td>([^<]*)<\/td>/g;
  let m;
  while ((m = re.exec(desc))) out[m[1].trim()] = m[2].trim();
  return out;
}

const areas = [];
for (const f of geo.features) {
  const p = { ...parseDescription(f.properties?.Description), ...f.properties };
  const name = p.PLN_AREA_N ?? p.pln_area_n ?? p.Name ?? "";
  const region = p.REGION_N ?? p.region_n ?? "";
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    const outer = dp(poly[0].map(([x, y]) => [x, y]), TOL).map(([x, y]) => [r5(x), r5(y)]);
    if (outer.length >= 4) rings.push(outer);
  }
  if (!rings.length) continue;
  let sx = 0, sy = 0, n = 0;
  for (const [x, y] of rings[0]) { sx += x; sy += y; n++; }
  areas.push({ name: String(name).trim(), region: String(region).trim(), center: [r5(sx / n), r5(sy / n)], rings });
}
writeJson(path.join(OUT, "planning-areas.json"), areas);
console.log(`Planning areas: ${areas.length}, ${areas.reduce((a, x) => a + x.rings.reduce((b, r) => b + r.length, 0), 0)} vertices`);
