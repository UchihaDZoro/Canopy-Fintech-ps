// Dev helper: headless screenshots of the running app using the system Edge.
// usage: node scripts/shot.mjs <url> <outDir> [steps.json]
// steps: [{ "click": "text=..."} | { "wait": ms } | { "scroll": y } | { "shot": "name" } | { "fill": [selector, value] } | { "eval": "js" }]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [url, outDir, stepsFile] = process.argv.slice(2);
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, "utf8")) : [{ wait: 4000 }, { shot: "page" }];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const vw = Number(process.env.VW ?? 1440), vh = Number(process.env.VH ?? 900);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
// BLOCK=<regex> aborts matching requests (e.g. to test offline fallbacks)
if (process.env.BLOCK) await page.route(new RegExp(process.env.BLOCK), (r) => r.abort());
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.locator(s.click).first().click({ timeout: 15000 });
  if (s.fill) await page.locator(s.fill[0]).first().fill(s.fill[1]);
  if (s.scroll !== undefined) await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), s.scroll);
  if (s.scrollTo) await page.locator(s.scrollTo).first().scrollIntoViewIfNeeded();
  if (s.eval) console.log("eval:", JSON.stringify(await page.evaluate(s.eval)));
  if (s.shot) {
    const f = path.join(outDir, `${s.shot}.png`);
    await page.screenshot({ path: f, fullPage: !!s.full, timeout: 120000 });
    console.log("shot", f);
  }
}
console.log(logs.slice(0, 15).join("\n"));
await browser.close();
