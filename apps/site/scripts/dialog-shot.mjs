import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:3300/catering/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Book a Demo" }).first().click();
await p.locator("dialog").getByRole("button", { name: "Request a demo" }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: "scripts/.raw/preview/dialog-errors.png" });
await b.close();
