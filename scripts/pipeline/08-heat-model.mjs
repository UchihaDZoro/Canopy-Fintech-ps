// Step 8: Explainable heat-stress model.
// NEA WBGT observations only exist from Feb 2025, but MSS temperatures go back decades.
// We fit a transparent linear model:  daily max WBGT ≈ b0 + b1·Tmax + b2·Tmean + b3·ln(1+rain) + b4·sin(doy) + b5·cos(doy)
// on (WBGT station, nearest MSS temperature station) pairs, validate on a time-based hold-out,
// and use it to reconstruct heat-stress history for the back-test. Coefficients are shown in the UI.
import path from "node:path";
import { readJson, writeJson, haversineKm, OUT } from "./lib.mjs";

const MAX_KM = Number(process.env.HEAT_MAX_KM ?? 8);
const wbgt = readJson(path.join(OUT, "wbgt-daily.json"));
const wStations = readJson(path.join(OUT, "wbgt-stations.json"));
const mssIndex = readJson(path.join(OUT, "stations.json")).filter((s) => s.tempDays > 365);
const mssCache = new Map();
const mss = (id) => {
  if (!mssCache.has(id)) {
    const s = readJson(path.join(OUT, "mss", `${id}.json`));
    s.pos = new Map(s.date.map((d, i) => [d, i]));
    mssCache.set(id, s);
  }
  return mssCache.get(id);
};

const features = (tmax, tmean, rain, date) => {
  const doy = (Date.parse(date) - Date.parse(date.slice(0, 4) + "-01-01")) / 864e5;
  const a = (2 * Math.PI * doy) / 365.25;
  return [1, tmax, tmean, Math.log1p(rain ?? 0), Math.sin(a), Math.cos(a)];
};
const NAMES = ["intercept", "Tmax (°C)", "Tmean (°C)", "ln(1+rain mm)", "season sin", "season cos"];

const rows = [];
const pairs = [];
for (const ws of wStations) {
  const near = mssIndex
    .map((m) => ({ m, km: haversineKm(ws, m) }))
    .sort((a, b) => a.km - b.km)[0];
  if (!near || near.km > MAX_KM) continue;
  const series = wbgt.stations[ws.id];
  if (!series) continue;
  const m = mss(near.m.id);
  let n = 0;
  wbgt.date.forEach((d, i) => {
    const y = series.max[i];
    const j = m.pos.get(d);
    if (y == null || j === undefined) return;
    const tmax = m.tmax[j], tmean = m.tmean[j];
    if (tmax == null || tmean == null) return;
    rows.push({ date: d, x: features(tmax, tmean, m.rain[j], d), y, hHigh: series.hHigh[i] });
    n++;
  });
  if (n) pairs.push({ wbgt: ws.id, wbgtName: ws.name, mss: near.m.id, km: Number(near.km.toFixed(2)), n });
}
if (rows.length < 50) throw new Error(`Not enough paired observations (${rows.length})`);

// Time-based split: last 25% of dates for validation
const dates = [...new Set(rows.map((r) => r.date))].sort();
const cut = dates[Math.floor(dates.length * 0.75)];
const train = rows.filter((r) => r.date < cut);
const test = rows.filter((r) => r.date >= cut);

function ols(data, lambda = 1e-6) {
  const k = data[0].x.length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (const { x, y } of data) {
    for (let i = 0; i < k; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < k; i++) A[i][i] += lambda;
  // Gaussian elimination
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[k] / r[i]);
}
const predict = (beta, x) => x.reduce((s, v, i) => s + v * beta[i], 0);
function metrics(beta, data) {
  const ys = data.map((r) => r.y);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sse = 0, sst = 0, mae = 0, tp = 0, fp = 0, fn = 0;
  for (const r of data) {
    const p = predict(beta, r.x);
    sse += (r.y - p) ** 2;
    sst += (r.y - mean) ** 2;
    mae += Math.abs(r.y - p);
    const obs = r.y >= 33, pr = p >= 33;
    if (obs && pr) tp++;
    else if (pr) fp++;
    else if (obs) fn++;
  }
  return {
    n: data.length,
    r2: Number((1 - sse / sst).toFixed(3)),
    mae: Number((mae / data.length).toFixed(2)),
    rmse: Number(Math.sqrt(sse / data.length).toFixed(2)),
    highDays: { observed: tp + fn, predicted: tp + fp, hit: tp },
  };
}

const beta = ols(train);
const trainM = metrics(beta, train);
const testM = metrics(beta, test);
// Residual spread from validation: used to turn a point estimate into P(WBGT ≥ threshold)
const resid = test.map((r) => r.y - predict(beta, r.x));
const sigma = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / resid.length);
// Final model refit on all data (validation metrics reported from the hold-out)
const betaAll = ols(rows);

const model = {
  version: "heat-wbgt-ols-v1",
  target: "Daily maximum WBGT (°C) at NEA WBGT station",
  features: NAMES,
  coefficients: betaAll.map((v) => Number(v.toFixed(5))),
  residualSigma: Number(sigma.toFixed(3)),
  train: { ...trainM, from: train[0]?.date, to: dates[dates.indexOf(cut) - 1] },
  validation: { ...testM, from: cut, to: dates.at(-1) },
  pairs,
  fittedAt: new Date().toISOString(),
};
writeJson(path.join(OUT, "heat-model.json"), model);
console.log("Heat model coefficients:");
NAMES.forEach((n, i) => console.log(`  ${n.padEnd(16)} ${betaAll[i].toFixed(4)}`));
console.log("Train:", trainM);
console.log("Validation:", testM, "sigma", sigma.toFixed(2));
