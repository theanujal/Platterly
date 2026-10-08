// Screenshots of the built site for a visual check: node scripts/preview.mjs (serve out/ on port 3300 first).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("scripts/.raw/preview", { recursive: true });
const browser = await chromium.launch();
async function open(page, path) {
  await page.goto(`http://localhost:3300/${path}${path ? "/" : ""}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
  // lazy images only load when scrolled to
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}
for (const [label, width, height] of [["desktop", 1280, 800], ["phone", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: label === "phone" ? 2 : 1 });
  for (const path of ["", "catering", "about", "privacy", "terms", "refund"]) {
    await open(page, path);
    await page.screenshot({ path: `scripts/.raw/preview/${label}-${path || "home"}-top.png` });
    if (path === "catering") {
      for (const id of ["pricing", "screens", "faq", "how", "features"]) {
        await page.locator(`section:has(#${id})`).screenshot({ path: `scripts/.raw/preview/${label}-catering-${id}.png` });
      }
    }
  }
  await page.close();
}
await browser.close();
console.log("done");
