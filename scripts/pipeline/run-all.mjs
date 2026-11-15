// Runs the whole Canopy data pipeline in order. Every step is resumable (raw downloads
// are cached under data/raw), so re-running only fetches what is missing.
//   npm run pipeline            → everything
//   npm run pipeline -- 04 08   → only the named steps
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const steps = fs
  .readdirSync(here)
  .filter((f) => /^\d\d-.*\.mjs$/.test(f))
  .sort()
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)));

for (const s of steps) {
  console.log(`\n▶ ${s}`);
  const r = spawnSync(process.execPath, [path.join(here, s)], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✖ ${s} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}
console.log("\n✓ pipeline complete");
