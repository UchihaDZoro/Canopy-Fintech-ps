// Step 1: Build the station registry (id, name, coordinates) from NEA/MSS APIs.
// Station lists change over time, so we take the union across several snapshots.
import path from "node:path";
import { fetchRetry, sleep, writeJson, RAW, OUT } from "./lib.mjs";

const SNAPSHOTS = ["2016-12-01", "2018-06-01", "2020-06-01", "2022-06-01", "2024-06-01", ""];
const API = "https://api-open.data.gov.sg/v2/real-time/api";

const stations = new Map();
function upsert(id, name, lat, lon, source) {
  lat = Number(lat);
  lon = Number(lon);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) return;
  const s = stations.get(id) ?? { id, name, lat, lon, sources: [] };
  s.name = name || s.name;
  s.lat = lat;
  s.lon = lon;
  if (!s.sources.includes(source)) s.sources.push(source);
  stations.set(id, s);
}

for (const snap of SNAPSHOTS) {
  for (const kind of ["rainfall", "air-temperature"]) {
    const url = `${API}/${kind}${snap ? `?date=${snap}` : ""}`;
    const j = await fetchRetry(url, { asJson: true });
    const list = j?.data?.stations ?? [];
    for (const s of list) upsert(s.id, s.name, s.location?.latitude, s.location?.longitude, kind);
    console.log(`  ${kind} ${snap || "now"}: ${list.length} stations`);
    await sleep(1500);
  }
}

// WBGT stations (observations started Feb 2025)
const w = await fetchRetry(`${API}/weather?api=wbgt`, { asJson: true });
const wReadings = w?.data?.records?.[0]?.item?.readings ?? [];
const wbgtStations = wReadings.map((r) => ({
  id: r.station.id,
  name: r.station.townCenter || r.station.name,
  lat: Number(r.location.latitude),
  lon: Number(r.location.longitude),
}));
console.log(`  wbgt: ${wbgtStations.length} stations`);

const list = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
writeJson(path.join(RAW, "stations.json"), list);
writeJson(path.join(OUT, "wbgt-stations.json"), wbgtStations);
console.log(`Stations registry: ${list.length} rain/temperature stations, ${wbgtStations.length} WBGT stations`);
