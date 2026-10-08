// Takes frames of each clip at a few moments, to confirm the loop start skips the blank page-load frames: node scripts/check-video.mjs
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const name of ["tour", "kitchen-board"]) {
  await page.goto(`http://localhost:3300/media/${name}.webm`);
  const info = await page.evaluate(async () => {
    const v = document.querySelector("video");
    await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r)));
    return { duration: v.duration };
  });
  console.log(name, info);
  for (const t of [0.3, 1, 2, 3]) {
    await page.evaluate((time) => new Promise((r) => { const v = document.querySelector("video"); v.onseeked = r; v.currentTime = time; }), t);
    await page.screenshot({ path: `scripts/.raw/preview/clip-${name}-${t}.png`, clip: { x: 0, y: 0, width: 640, height: 400 } });
  }
}
await browser.close();
