// Viewport screenshots down a page: node scripts/scroll-shots.mjs <path> <name> [width] [height]
import { chromium } from "playwright";
const [path, name, w = "1280", h = "800"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:3300${path}`, { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
const total = await p.evaluate(() => document.body.scrollHeight);
let i = 0;
for (let y = 0; y < total; y += +h - 80) {
  await p.evaluate((top) => window.scrollTo(0, top), y);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `scripts/.raw/preview/${name}-${String(i++).padStart(2, "0")}.png` });
}
console.log("shots", i, "height", total);
await b.close();
