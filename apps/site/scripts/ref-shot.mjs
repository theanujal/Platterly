// A reference screenshot of a public page, for design comparison only: node scripts/ref-shot.mjs <url> <name>
import { chromium } from "playwright";
const [url, name] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.log("goto:", e.message));
await p.waitForTimeout(4000);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } window.scrollTo(0, 0); });
await p.waitForTimeout(1500);
await p.screenshot({ path: `scripts/.raw/ref/${name}-top.png` });
await p.screenshot({ path: `scripts/.raw/ref/${name}-full.png`, fullPage: true });
console.log("height", await p.evaluate(() => document.body.scrollHeight));
await b.close();
