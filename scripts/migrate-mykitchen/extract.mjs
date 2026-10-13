// Step 1 of moving a client from mykitchen.platterly.in into Caterly. READ-ONLY: signs in with the client's login and
// saves what the old admin screens load (their JSON API responses) plus the pictures into migration-data/mykitchen/
// (git-ignored: it holds customers' phones and emails). Nothing is ever edited or deleted in the old app.
// Run: MK_USER=... MK_PASS=... node scripts/migrate-mykitchen/extract.mjs
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://mykitchen.platterly.in";
const API_HOST = "https://super.platterly.in";
const OUT = path.resolve("migration-data/mykitchen");
const { MK_USER, MK_PASS } = process.env;
if (!MK_USER || !MK_PASS) throw new Error("Set MK_USER and MK_PASS in the environment (do not put them in a file).");

await mkdir(path.join(OUT, "json"), { recursive: true });
await mkdir(path.join(OUT, "images"), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const seen = new Map();
page.on("response", async (r) => {
  const q = r.request();
  if (q.method() !== "GET" || !["xhr", "fetch"].includes(q.resourceType())) return;
  try {
    seen.set(new URL(r.url()).pathname, await r.text());
  } catch {
    /* a redirect or aborted request has no body */
  }
});

await page.goto(`${SITE}/kitchenLogin`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', MK_USER);
await page.fill('input[type="password"]', MK_PASS);
await page.keyboard.press("Enter");
await page.waitForURL("**/AdminDashboard", { timeout: 30000 });
for (const p of ["Orders", "Customers", "MenuManagement", "EventTypeManagement", "AddOnManagement", "Settings"]) {
  await page.goto(`${SITE}/${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}
await browser.close();

const files = { "/api/business/me": "business", "/api/menus": "menus", "/api/categories": "categories", "/api/menu-items": "menu-items", "/api/add-ons": "add-ons", "/api/customers": "customers", "/api/event-requests": "orders", "/api/event-types": "event-types", "/api/subscription/plans": "plans" };
const counts = {};
const images = new Set();
for (const [route, name] of Object.entries(files)) {
  const body = seen.get(route);
  if (!body) throw new Error(`The old app did not load ${route}.`);
  const rows = JSON.parse(body);
  counts[name] = Array.isArray(rows) ? rows.length : 1;
  await writeFile(path.join(OUT, "json", `${name}.json`), JSON.stringify(rows, null, 1));
  for (const row of Array.isArray(rows) ? rows : [rows]) for (const key of ["image_url", "logo_url"]) if (row[key]) images.add(row[key]);
}

// Pictures: relative paths live on the API host.
const queue = [...images];
const failed = [];
let done = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let url = queue.pop(); url; url = queue.pop()) {
      const res = await fetch(url.startsWith("http") ? url : API_HOST + url).catch(() => null);
      if (!res || !res.ok) { failed.push(url); continue; }
      await mkdir(path.dirname(path.join(OUT, "images", new URL(url, API_HOST).pathname)), { recursive: true });
      await writeFile(path.join(OUT, "images", new URL(url, API_HOST).pathname), Buffer.from(await res.arrayBuffer()));
      done += 1;
    }
  }),
);
console.log("Saved", counts, `pictures: ${done} downloaded, ${failed.length} failed`, failed.slice(0, 5));
